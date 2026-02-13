import uuid
import random
import time
import pandas as pd
import json
import os
import logging
from datetime import datetime, timedelta
from kafka import KafkaProducer
from sqlalchemy import create_engine, text
from dotenv import load_dotenv


load_dotenv()

### CONFIGURACION LOGGING ###

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

###  CONEXION A SQL SERVER  ###
engine = create_engine(f"mssql+pymssql://@{os.getenv('DB_SERVER', 'localhost')}/{os.getenv('DB_NAME')}")


###  CONFIGURACIOND E KAFKA  ###
producer = KafkaProducer(
    bootstrap_servers=os.getenv("KAFKA_SERVER", "127.0.0.1:9092"),
    value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8')
)


###  OBTENER CONSTRUCTS DISPONIBLES  ###
try:
    constructs = pd.read_sql(
        "SELECT ResourceID, ResourceName FROM automateconstructs WHERE ResourceType = 2",
        engine
    ).to_dict("records")
    logging.info(f"{len(constructs)} constructos cargados para simulación.")
except Exception:
    logging.exception("Error cargando constructos en simulador.py")
    raise


def simular_ejecucion():
    try:
        selected = random.choice(constructs)

        now = datetime.now()
        duration = random.randint(6, 10)
        end_time = now + timedelta(seconds=duration)

        # Estados posibles
        final_status = random.choices([1, 2, 7], weights=[0.7, 0.2, 0.1])[0]
        result_code = final_status

        # IDs
        instance_id = str(uuid.uuid4())
        transaction_id = str(uuid.uuid4())
        workflow_id = str(uuid.uuid4())
        event_id1 = str(uuid.uuid4())
        event_id2 = str(uuid.uuid4())

        agent_id = '1b271033-0bc2-4cd0-bac5-df25bfa35b33'
        construct_id = selected['ResourceID']
        construct_name = selected['ResourceName']

        texto_resultado = {
            1: f"Task '{construct_name}' completed successfully.",
            2: f"Task '{construct_name}' failed due to error.",
            7: f"Task '{construct_name}' timed out.",
            12: f"Task '{construct_name}' running on agent 'BS-ROBOT01'..."
        }

        # ---------- BLOQUE INICIAL: evento "en ejecución" + instancia ----------
        with engine.begin() as conn:
            # Evento inicial (en ejecución)
            conn.execute(text("""
                INSERT INTO executionevents (
                    ID, ConstructID, StartDateTime, EndDateTime, ResultCode, ResultText,
                    InstanceID, AgentID, RowID, TransactionID, WorkflowInstanceID, UserID
                ) VALUES (
                    :id, :construct, :start, :end, :code, :text,
                    :instance, :agent, :rowid, :trans, :workflow, :user
                )
            """), {
                "id": event_id1,
                "construct": construct_id,
                "start": now,
                "end": now,
                "code": 12,
                "text": "",
                "instance": instance_id,
                "agent": agent_id,
                "rowid": random.randint(1_000_000, 9_999_999),
                "trans": transaction_id,
                "workflow": workflow_id,
                "user": 0
            })

            # Calcular el siguiente RowID disponible
            next_row_id = conn.execute(
                text("SELECT ISNULL(MAX(RowID), 0) + 1 FROM instances")
            ).scalar()

            # Registro de instancia
            conn.execute(text("""
                INSERT INTO instances (
                    RowID, ID, InstanceID, TransactionID, WorkflowInstanceID, ConstructID, ConstructType,
                    ConstructName, ConstructPath, AgentID, AgentName, AgentPath,
                    StartDateTime, EndDateTime, Duration, LastChanged, Status, ResultCode, ResultText,
                    Scheduled, Reactive, UserID, UserName, UserPath,
                    TriggerID, TriggerType, TriggerName, TriggerPath
                ) VALUES (
                    :rowid, :id, :instance, :trans, :workflow, :construct, :ctype,
                    :cname, :cpath, :agent, :aname, :apath,
                    :start, :end, :dur, :last, :status, :rcode, :rtext,
                    :sched, :react, :uid, :uname, :upath,
                    :trid, :trtype, :trname, :trpath
                )
            """), {
                "rowid": next_row_id,
                "id": str(uuid.uuid4()),
                "instance": instance_id,
                "trans": transaction_id,
                "workflow": workflow_id,
                "construct": construct_id,
                "ctype": 2,
                "cname": construct_name,
                "cpath": r"\TASKS\Procesos\\",
                "agent": agent_id,
                "aname": "BS-ROBOT01",
                "apath": r"\TASKAGENTS",
                "start": now,
                "end": end_time,
                "dur": duration,
                "last": now,
                "status": 12,
                "rcode": -1,
                "rtext": "",
                "sched": 0,
                "react": 0,
                "uid": 0,
                "uname": "",
                "upath": "",
                "trid": 0,
                "trtype": 0,
                "trname": "",
                "trpath": ""
            })

            # Actualizar automateconstructs: StartedOn, LastModifiedOn
            conn.execute(text("""
                UPDATE automateconstructs
                SET StartedOn = :start, LastModifiedOn = :last
                WHERE ResourceID = :rid
            """), {
                "start": now,
                "last": now,
                "rid": construct_id
            })

        # Evento de ejecución en Kafka
        producer.send('rpa-execution-events', {
            "InstanceID": instance_id,
            "ConstructID": construct_id,
            "StartDateTime": now,
            "Status": 12,
            "ResultCode": -1
        })
        producer.flush()

        logging.info(f"Ejecutando {construct_name} ({instance_id})")

        # Simula la duración de la ejecución
        time.sleep(duration)

        # ---------- BLOQUE FINAL: evento final + updates + resumen ----------
        with engine.begin() as conn:
            # Evento final
            conn.execute(text("""
                INSERT INTO executionevents (
                    ID, ConstructID, StartDateTime, EndDateTime, ResultCode, ResultText,
                    InstanceID, AgentID, RowID, TransactionID, WorkflowInstanceID, UserID
                ) VALUES (
                    :id, :construct, :start, :end, :code, :text,
                    :instance, :agent, :rowid, :trans, :workflow, :user
                )
            """), {
                "id": event_id2,
                "construct": construct_id,
                "start": now,
                "end": end_time,
                "code": result_code,
                "text": texto_resultado[result_code],
                "instance": instance_id,
                "agent": agent_id,
                "rowid": random.randint(1_000_000, 9_999_999),
                "trans": transaction_id,
                "workflow": workflow_id,
                "user": 0
            })

            # Actualizar instancia
            conn.execute(text("""
                UPDATE instances
                SET EndDateTime = :end,
                    Duration = :dur,
                    LastChanged = :last,
                    Status = :status,
                    ResultCode = :rcode,
                    ResultText = :rtext
                WHERE InstanceID = :instance
            """), {
                "end": end_time,
                "dur": duration,
                "last": end_time,
                "status": final_status,
                "rcode": result_code,
                "rtext": texto_resultado[result_code],
                "instance": instance_id
            })

            # Actualizar automateconstructs
            conn.execute(text("""
                UPDATE automateconstructs
                SET EndedOn = :end,
                    LastModifiedOn = :last,
                    ResultCode = :rcode,
                    ResultText = :rtext,
                    SuccessCount = SuccessCount + :succ,
                    FailureCount = FailureCount + :fail
                WHERE ResourceID = :rid
            """), {
                "end": end_time,
                "last": end_time,
                "rcode": result_code,
                "rtext": texto_resultado[result_code],
                "succ": 1 if result_code == 1 else 0,
                "fail": 1 if result_code != 1 else 0,
                "rid": construct_id
            })

        # Emitir resumen
        producer.send('rpa-instance-summary', {
            "InstanceID": instance_id,
            "ConstructName": construct_name,
            "StartDateTime": now,
            "EndDateTime": end_time,
            "Duration": duration,
            "Status": final_status,
            "ResultCode": result_code,
            "Success": result_code == 1
        })
        producer.flush()

        logging.info(f"Finalizó {construct_name} con estado {texto_resultado[result_code]}")

    except Exception:
        logging.exception("Error en simular_ejecucion()")


# Loop infinito
if __name__ == "__main__":
    while True:
        try:
            simular_ejecucion()
        except Exception:
            logging.exception("Error en el bucle principal del simulador")
            time.sleep(5)
