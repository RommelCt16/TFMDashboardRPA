from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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
from datetime import datetime

load_dotenv()

### CONFIGURACION DE LOGS ###
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# Crear el motor de SQLAlchemy con pymssql
# Para localhost: mssql+pymssql://@localhost/DB_NAME
# O con usuario: mssql+pymssql://usuario:contraseña@localhost/DB_NAME
engine = create_engine(f"mssql+pymssql://@{os.getenv('DB_SERVER', 'localhost')}/{os.getenv('DB_NAME')}")

app = FastAPI()
clients = set()
loop = None

@app.on_event("startup")
async def on_startup():
    global loop
    loop = asyncio.get_running_loop()
    logging.info("✅ Event loop capturado en startup")
        

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

###  RUTAS DE FRONTEND  ###

# Servir archivos estáticos desde la carpeta "static"
#app.mount("/static", StaticFiles(directory="./static"), name="static")
# Servir index.html cuando acceden a "/"
@app.get("/")
async def root():
    #Ejecutar producer.py cada vez que se carga la página
    return JSONResponse(
        content={
            "status": "ok",
            "message": "Backend RPA Dashboard activo",
        }
    )

@app.get("/general")
async def dashboard_general():
    return FileResponse(os.path.join("static", "general.html"))

@app.get("/detalle.html")
async def detalle():
    return FileResponse(os.path.join("static", "detalle.html"))

# Servir favicon.ico si existe
@app.get("/favicon.ico")
async def favicon():
    path = os.path.join("static", "favicon.ico")
    return FileResponse(path) if os.path.exists(path) else Response(status_code=204)


###  API REST   ###

# API para consultar tareas, filtrando por día o mes
@app.get("/api/todas_las_tareas")
async def todas_las_tareas(request: Request):
    try:
        # Leer parámetros de consulta
        params = request.query_params
        dia = params.get("dia")
        mes = params.get("mes")

        # Si no se pasa ningún parámetro, se filtra por el día actual
        if not dia and not mes:
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
            i.ConstructPath
        FROM instances i
        LEFT JOIN automateconstructs ac ON i.ConstructID = ac.ResourceID
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
        elif mes:
            query += " AND FORMAT(i.StartDateTime, 'yyyy-MM') = :mes"
            params_sql["mes"] = mes

        query += " ORDER BY i.StartDateTime DESC"

        with engine.connect() as conn:
            rows = conn.execute(text(query), params_sql)
            results = [dict(row._mapping) for row in rows]

        return results

    except Exception:
        logging.exception("Error en /api/todas_las_tareas")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


# Endpoint de historial por ID de instancia
@app.get("/api/historial_construct/{construct_id}")
async def historial_por_construct(construct_id: str):
    try:
        query = """
            SELECT 
                i.InstanceID,
                i.ConstructName,
                i.StartDateTime,
                i.EndDateTime,
                i.ResultText,
                i.Duration,
                ac.SuccessCount, 
                ac.FailureCount,
                iw.ConstructName AS Workflow,
                iw.ConstructPath AS PathWorkflow,
                i.AgentName,
                i.Status
            FROM instances i
            LEFT JOIN automateconstructs ac ON i.ConstructID = ac.ResourceID
            LEFT JOIN instances iw ON iw.InstanceID = i.WorkflowInstanceId
            WHERE i.ConstructID = :cid
            ORDER BY i.StartDateTime DESC
        """
        with engine.connect() as conn:
            rows = conn.execute(text(query), {"cid": construct_id})
            results = [dict(row._mapping) for row in rows]

        return results

    except Exception as e:
        logging.exception("Error en /api/historial_construct")
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


@app.get("/api/instancias_actuales")
async def instancias_actuales():
    return get_instancias_actuales_snapshot()


###  WEBSOCKET  ###

@app.websocket("/ws/instancias")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)

    # ✅ Enviar snapshot inicial al cliente
    try:
        snapshot = get_instancias_actuales_snapshot()
        await websocket.send_text(json.dumps({
            "tipo": "snapshot",
            "items": snapshot
        }, default=str))
        logging.info(f"📤 Snapshot enviado por WS: {len(snapshot)} items")
    except Exception:
        logging.exception("Error enviando snapshot al cliente WS")

    try:
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        clients.remove(websocket)


# === 🧠 Función para enviar a todos los clientes conectados ===
async def broadcast(message: dict):
    disconnected = []
    for ws in clients:
        try:
            await ws.send_text(json.dumps(message, default=str))
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        clients.remove(ws)


### KAFKA LISTENER ###


# Función para escuchar mensajes de Kafka y reenviar por WebSocket
def kafka_listener():
    consumer = KafkaConsumer(
        'rpa-instance-summary',
        'rpa-execution-events',
        'instancias',
        bootstrap_servers=os.getenv("KAFKA_SERVER", "127.0.0.1:9092"),
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset='latest',
        group_id='rpa-dashboard'
    )

    logging.info("🟢 Backend escuchando Kafka...")

    for msg in consumer:
        topic = msg.topic
        data = msg.value
        tipo = "summary" if topic == "rpa-instance-summary" else "event"

        # Agregar campo para que el frontend lo identifique
        data["tipo"] = tipo

        if loop is not None:
            asyncio.run_coroutine_threadsafe(broadcast(data), loop)
        else:
            logging.warning("Loop no inicializado aún; mensaje Kafka ignorado temporalmente")


# Lanzar consumidor Kafka en hilo separado
threading.Thread(target=kafka_listener, daemon=True).start()
