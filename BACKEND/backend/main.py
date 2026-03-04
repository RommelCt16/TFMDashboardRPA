from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from kafka import KafkaConsumer
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from fastapi.responses import JSONResponse

import json
import asyncio
import threading
import os
import logging
from datetime import datetime, timedelta

load_dotenv()

### CONFIGURACION DE LOGS ###
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# Crear el motor de SQLAlchemy con pymssql
# Para localhost: mssql+pymssql://@localhost/DB_NAME
# O con usuario: mssql+pymssql://usuario:contraseÃ±a@localhost/DB_NAME
engine = create_engine(f"mssql+pymssql://@{os.getenv('DB_SERVER', 'localhost')}/{os.getenv('DB_NAME')}")

app = FastAPI()
clients = set()
loop = None
consumer_thread = None
stop_event = threading.Event()
kafka_consumer = None

@app.on_event("startup")
async def on_startup():
    global loop, consumer_thread
    loop = asyncio.get_running_loop()
    stop_event.clear()
    logging.info("Event loop capturado en startup")
    if consumer_thread is None or not consumer_thread.is_alive():
        consumer_thread = threading.Thread(target=kafka_listener, daemon=True)
        consumer_thread.start()
        logging.info("Kafka listener iniciado")

@app.on_event("shutdown")
async def on_shutdown():
    global loop, consumer_thread, kafka_consumer
    stop_event.set()
    try:
        if kafka_consumer is not None:
            kafka_consumer.close()
    except Exception:
        logging.exception("Error cerrando Kafka consumer")

    if consumer_thread is not None and consumer_thread.is_alive():
        consumer_thread.join(timeout=3)

    kafka_consumer = None
    consumer_thread = None
    loop = None

# CORS
cors_origins = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
cors_allow_credentials = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() == "true"
if "*" in cors_origins and cors_allow_credentials:
    logging.warning("CORS '*' con credenciales no es vÃ¡lido; desactivando credenciales.")
    cors_allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["http://localhost:5173"],
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

###  RUTAS DE FRONTEND  ###

# Servir archivos estÃ¡ticos desde la carpeta "static"
# Servir index.html cuando acceden a "/"
@app.get("/")
async def root():
    # Endpoint de estado base del backend.
    return JSONResponse(
        content={
            "status": "ok",
            "message": "Backend RPA Dashboard activo",
        }
    )

# Servir favicon.ico si existe
@app.get("/favicon.ico")
async def favicon():
    path = os.path.join("static", "favicon.ico")
    return FileResponse(path) if os.path.exists(path) else Response(status_code=204)


###  API REST   ###

# API para consultar tareas, filtrando por dÃ­a o mes
@app.get("/api/todas_las_tareas")
async def todas_las_tareas(request: Request):
    try:
        # Leer parÃ¡metros de consulta
        params = request.query_params
        dia = params.get("dia")
        semana = params.get("semana")
        mes = params.get("mes")
        logging.info("Filtro recibido /api/todas_las_tareas -> dia=%s semana=%s mes=%s", dia, semana, mes)

        # Si no se pasa ningÃºn parÃ¡metro, se filtra por el dÃ­a actual
        if not dia and not semana and not mes:
            dia = datetime.now().strftime("%Y-%m-%d")

        # Consulta base
        query = """
        SELECT
            i.InstanceID,
            i.ConstructID,
            i.ConstructName,
            i.StartDateTime,
            i.EndDateTime,
            ISNULL(i.Duration, DATEDIFF(SECOND, i.StartDateTime, i.EndDateTime)) AS DurationSeconds,
            i.ResultCode,
            i.ResultText,
            i.AgentName,
            iw.ConstructName AS Workflow,
            i.ConstructPath
        FROM instances i
        LEFT JOIN automateconstructs ac ON i.ConstructID = ac.ResourceID
        LEFT JOIN instances iw
          ON CONVERT(varchar(64), iw.InstanceID) = CONVERT(varchar(64), i.WorkflowInstanceId)
        WHERE ac.ResourceType = 2
          AND ac.CompletionState = 2
          AND i.ConstructPath LIKE :ruta_procesos
        """

        params_sql = {
            "ruta_procesos": r"%\Procesos\%"
        }

        if dia:
            query += " AND CONVERT(DATE, i.StartDateTime) = :dia"
            params_sql["dia"] = dia
            logging.info("Aplicando filtro DIA: %s", dia)
        elif semana:
            # Parse robusto para formato de input[type=week]: YYYY-Www
            try:
                semana_value = semana.strip().upper()
                if "-W" in semana_value:
                    year_str, week_str = semana_value.split("-W")
                    week_start = datetime.fromisocalendar(int(year_str), int(week_str), 1).date()
                else:
                    # Fallback si el browser envía fecha (YYYY-MM-DD) en lugar de week.
                    fallback_date = datetime.strptime(semana_value, "%Y-%m-%d").date()
                    week_start = fallback_date - timedelta(days=fallback_date.isoweekday() - 1)
            except Exception:
                raise HTTPException(
                    status_code=422,
                    detail="Formato de semana invalido. Use YYYY-Www (ej. 2026-W10)."
                )
            week_end = week_start + timedelta(days=7)
            query += " AND i.StartDateTime >= :week_start AND i.StartDateTime < :week_end"
            params_sql["week_start"] = week_start
            params_sql["week_end"] = week_end
            logging.info("Aplicando filtro SEMANA: %s -> [%s, %s)", semana, week_start, week_end)
        elif mes:
            # Filtrado mensual por rango para evitar problemas de formato y mejorar rendimiento.
            try:
                month_start = datetime.strptime(f"{mes}-01", "%Y-%m-%d").date()
            except Exception:
                raise HTTPException(
                    status_code=422,
                    detail="Formato de mes invalido. Use YYYY-MM (ej. 2026-03)."
                )

            if month_start.month == 12:
                month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
            else:
                month_end = month_start.replace(month=month_start.month + 1, day=1)

            query += " AND i.StartDateTime >= :month_start AND i.StartDateTime < :month_end"
            params_sql["month_start"] = month_start
            params_sql["month_end"] = month_end
            logging.info("Aplicando filtro MES: %s -> [%s, %s)", mes, month_start, month_end)

        query += " ORDER BY i.StartDateTime DESC"

        with engine.connect() as conn:
            rows = conn.execute(text(query), params_sql)
            results = [dict(row._mapping) for row in rows]

        return results

    except HTTPException:
        raise
    except Exception:
        logging.exception("Error en /api/todas_las_tareas")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@app.get("/api/historial_construct/{construct_id}")
async def historial_construct(construct_id: str):
    try:
        construct_id_clean = str(construct_id).strip().strip("{}").lower()
        if not construct_id_clean:
            raise HTTPException(status_code=422, detail="construct_id invalido")

        query = """
        SELECT
            i.InstanceID,
            i.ConstructID,
            i.ConstructName,
            i.StartDateTime,
            i.EndDateTime,
            ISNULL(i.Duration, DATEDIFF(SECOND, i.StartDateTime, i.EndDateTime)) AS DurationSeconds,
            i.Status,
            i.ResultCode,
            i.ResultText,
            i.AgentName,
            iw.ConstructName AS Workflow,
            ac.SuccessCount,
            ac.FailureCount
        FROM instances i
        LEFT JOIN automateconstructs ac ON i.ConstructID = ac.ResourceID
        LEFT JOIN instances iw
          ON CONVERT(varchar(64), iw.InstanceID) = CONVERT(varchar(64), i.WorkflowInstanceId)
        WHERE ac.ResourceType = 2
          AND ac.CompletionState = 2
          AND i.ConstructPath LIKE :ruta_procesos
          AND LOWER(REPLACE(REPLACE(CONVERT(varchar(64), i.ConstructID), '{', ''), '}', '')) = :construct_id
        ORDER BY i.StartDateTime DESC
        """

        with engine.connect() as conn:
            rows = conn.execute(
                text(query),
                {
                    "ruta_procesos": r"%\Procesos\%",
                    "construct_id": construct_id_clean,
                },
            )
            results = [dict(row._mapping) for row in rows]

        return results
    except HTTPException:
        raise
    except Exception:
        logging.exception("Error en /api/historial_construct/%s", construct_id)
        raise HTTPException(status_code=500, detail="Error interno del servidor")




def get_instancias_actuales_snapshot():
    query = """
    WITH UltimaInstancia AS (
      SELECT 
        ee.InstanceID,
        i.ConstructID,
        i.ConstructName,
        i.StartDateTime,
        ee.EndDateTime,
        ISNULL(i.Duration, DATEDIFF(SECOND, i.StartDateTime, GETDATE())) AS DurationSeconds,
        ee.ResultCode,
        i.ConstructPath,
        SUBSTRING(
            i.ConstructPath,
            CHARINDEX('\\Procesos\\', i.ConstructPath) + LEN('\\Procesos\\'),
            CHARINDEX('\\', i.ConstructPath + '\\', CHARINDEX('\\Procesos\\', i.ConstructPath) + LEN('\\Procesos\\')) 
                - (CHARINDEX('\\Procesos\\', i.ConstructPath) + LEN('\\Procesos\\'))
        ) AS SubCarpeta,
        i.Status,
        ROW_NUMBER() OVER (PARTITION BY i.ConstructID ORDER BY ee.EndDateTime DESC) AS rn
      FROM executionevents ee
      LEFT JOIN instances i ON ee.InstanceID = i.InstanceID
      LEFT JOIN automateconstructs ac ON i.ConstructID = ac.ResourceID
      WHERE 
        ac.ResourceType = 2 
        AND ac.CompletionState = 2
        AND ac.Enabled = 1
        AND i.ConstructPath LIKE '%\\Procesos\\%'
    )
    SELECT *
    FROM UltimaInstancia
    WHERE rn = 1
    ORDER BY StartDateTime DESC;
    """
    with engine.connect() as conn:
        rows = conn.execute(text(query)).fetchall()
        return [dict(r._mapping) for r in rows]


###  WEBSOCKET  ###

@app.websocket("/ws/instancias")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)

    # âœ… Enviar snapshot inicial al cliente
    try:
        snapshot = get_instancias_actuales_snapshot()
        await websocket.send_text(json.dumps({
            "tipo": "snapshot",
            "items": snapshot
        }, default=str))
        logging.info(f"ðŸ“¤ Snapshot enviado por WS: {len(snapshot)} items")
    except Exception:
        logging.exception("Error enviando snapshot al cliente WS")

    try:
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        clients.discard(websocket)


# === ðŸ§  FunciÃ³n para enviar a todos los clientes conectados ===
async def broadcast(message: dict):
    disconnected = []
    for ws in clients:
        try:
            await ws.send_text(json.dumps(message, default=str))
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        clients.discard(ws)


### KAFKA LISTENER ###


# FunciÃ³n para escuchar mensajes de Kafka y reenviar por WebSocket
def kafka_listener():
    global kafka_consumer
    kafka_consumer = KafkaConsumer(
        'rpa-instance-summary',
        'rpa-execution-events',
        'instancias',
        bootstrap_servers=os.getenv("KAFKA_SERVER", "127.0.0.1:9092"),
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset='latest',
        group_id='rpa-dashboard',
        consumer_timeout_ms=1000,
    )

    logging.info("Backend escuchando Kafka...")

    try:
        while not stop_event.is_set():
            for msg in kafka_consumer:
                if stop_event.is_set():
                    break

                topic = msg.topic
                data = msg.value
                tipo = "summary" if topic == "rpa-instance-summary" else "event"

                logging.info(
                    "Kafka recibido | topic=%s partition=%s offset=%s key=%s",
                    topic,
                    msg.partition,
                    msg.offset,
                    msg.key.decode("utf-8", errors="ignore") if isinstance(msg.key, (bytes, bytearray)) else msg.key
                )
                logging.info(
                    "Kafka payload | topic=%s data=%s",
                    topic,
                    json.dumps(data, default=str, ensure_ascii=False)
                )

                # Agregar campo para que el frontend lo identifique
                data["tipo"] = tipo

                current_loop = loop
                if current_loop is None or current_loop.is_closed():
                    continue

                coro = broadcast(data)
                try:
                    asyncio.run_coroutine_threadsafe(coro, current_loop)
                except Exception:
                    # Evita warning "coroutine was never awaited" si no se pudo agendar
                    coro.close()
                    if not stop_event.is_set():
                        logging.exception("No se pudo programar broadcast en event loop")
    except Exception:
        if not stop_event.is_set():
            logging.exception("Error en kafka_listener")
    finally:
        try:
            if kafka_consumer is not None:
                kafka_consumer.close()
        except Exception:
            logging.exception("Error cerrando Kafka consumer en listener")
        kafka_consumer = None


