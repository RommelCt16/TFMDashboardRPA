import uuid
import random
import time
import pandas as pd
import json
import os
import logging
import threading
from datetime import datetime, timedelta
from kafka import KafkaProducer
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor


load_dotenv()
shutdown_event = threading.Event()

### CONFIGURACION LOGGING ###
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)


###  CONEXION A SQL SERVER  ###
engine = create_engine(
    f"mssql+pymssql://@{os.getenv('DB_SERVER', 'localhost')}/{os.getenv('DB_NAME')}"
)


###  CONFIGURACION DE KAFKA  ###
producer = KafkaProducer(
    bootstrap_servers=os.getenv("KAFKA_SERVER", "127.0.0.1:9092"),
    value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8')
)


### CONSULTA PARA CARGAR CATALOGO DE TAREAS ###
CatalogoTareasQuery = """
WITH task_last AS (
    SELECT
        i.ConstructID        AS TaskConstructID,
        i.ConstructName      AS TaskName,
        i.ConstructPath      AS TaskPath,
        i.AgentID            AS TaskAgentID,
        i.AgentName          AS TaskAgentName,
        i.AgentPath          AS TaskAgentPath,
        i.WorkflowInstanceID AS WorkflowInstanceID,
        ROW_NUMBER() OVER (
            PARTITION BY i.ConstructID
            ORDER BY i.StartDateTime DESC
        ) AS rn
    FROM instances i
    WHERE i.ConstructType = 2
      AND i.WorkflowInstanceID IS NOT NULL
),
wf_inst AS (
    SELECT
        i.InstanceID    AS WorkflowInstanceID,
        i.ConstructID   AS WorkflowConstructID,
        i.ConstructName AS WorkflowName,
        i.ConstructPath AS WorkflowPath
    FROM instances i
    WHERE i.ConstructType = 3
)
SELECT
    t.TaskConstructID,
    t.TaskName,
    t.TaskPath,
    t.TaskAgentID,
    t.TaskAgentName,
    t.TaskAgentPath,
    w.WorkflowConstructID,
    w.WorkflowName,
    w.WorkflowPath
FROM task_last t
LEFT JOIN wf_inst w
    ON w.WorkflowInstanceID = t.WorkflowInstanceID
WHERE t.rn = 1;
"""


def cargarCatalogoTareas(engine):
    df = pd.read_sql(CatalogoTareasQuery, engine)

    # Reglas mínimas para no romper
    df = df.dropna(subset=["TaskConstructID", "TaskName"])

    catalog = []
    for _, r in df.iterrows():
        catalog.append({
            "task_id": str(r["TaskConstructID"]),
            "task_name": r["TaskName"],
            "task_path": (r["TaskPath"] if pd.notna(r["TaskPath"]) else None),
            "task_agent_id": (str(r["TaskAgentID"]) if pd.notna(r["TaskAgentID"]) else None),
            "task_agent_name": (r["TaskAgentName"] if pd.notna(r["TaskAgentName"]) else None),
            "task_agent_path": (r["TaskAgentPath"] if pd.notna(r["TaskAgentPath"]) else None),

            "workflow_construct_id": (str(r["WorkflowConstructID"]) if pd.notna(r["WorkflowConstructID"]) else None),
            "workflow_name": (r["WorkflowName"] if pd.notna(r["WorkflowName"]) else None),
            "workflow_path": (r["WorkflowPath"] if pd.notna(r["WorkflowPath"]) else None),
        })

    return catalog

try:
    catalog = cargarCatalogoTareas(engine)
    logging.info(f"Catálogo de Tareas RPA cargado: {len(catalog)} items.")
    if not catalog:
        raise RuntimeError(
            "El catálogo quedó vacío. Verifica que existan tasks (ConstructType=2) con WorkflowInstanceID y workflows (ConstructType=3)."
        )
except Exception:
    logging.exception("Error cargando catálogo en simulador.py")
    raise


#### DEFINIMOS FUNCIONES DE SIMULACION ####
def siguienteRowID_Instances(conn):
    return conn.execute(
        text("SELECT ISNULL(MAX(RowID), 0) + 1 FROM instances WITH (TABLOCKX, HOLDLOCK)")
    ).scalar()

def siguienteRowID_ExecEvent(conn):
    return conn.execute(
        text("SELECT ISNULL(MAX(RowID), 0) + 1 FROM executionevents WITH (TABLOCKX, HOLDLOCK)")
    ).scalar()

def insertar_ExecutionEvent(conn, *, event_id, construct_id, instance_id, agent_id,
                           rowid, transaction_id, workflow_instance_id,
                           start_dt, end_dt, result_code, result_text):
    conn.execute(text("""
        INSERT INTO executionevents (
            ID, ConstructID, StartDateTime, EndDateTime, ResultCode, ResultText,
            InstanceID, AgentID, RowID, TransactionID, WorkflowInstanceID, UserID
        ) VALUES (
            :id, :construct, :start, :end, :code, :text,
            :instance, :agent, :rowid, :trans, :workflow, :user
        )
    """), {
        "id": event_id,
        "construct": construct_id,
        "start": start_dt,
        "end": end_dt,
        "code": result_code,
        "text": result_text,
        "instance": instance_id,
        "agent": agent_id,          # workflow puede ser NULL
        "rowid": rowid,
        "trans": transaction_id,
        "workflow": workflow_instance_id,
        "user": 0
    })

def insertar_Instance(conn, *, rowid, record_id, instance_id, transaction_id, workflow_instance_id,
                           construct_id, construct_type, construct_name, construct_path,
                           agent_id, agent_name, agent_path,
                           start_dt,end_dt):
    """
    RUNNING:
    - EndDateTime = NULL
    - Duration = NULL
    - Status = 12
    - ResultCode = -1
    - ResultText = ''
    """
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
            :start, :end, 0, :last, 12, '', '',
            0, 0,'', '', '',
            '', 0, '', ''
        )
    """), {
        "rowid": rowid,
        "id": record_id,
        "instance": instance_id,
        "trans": transaction_id,
        "workflow": workflow_instance_id,
        "construct": construct_id,
        "ctype": construct_type,
        "cname": construct_name,
        "cpath": construct_path,
        "agent": agent_id,
        "aname": agent_name,
        "apath": agent_path,
        "start": start_dt,
        "last": start_dt,
        "end": end_dt
    })
    
def actualizar_InicioConstruct(conn, *, modified_on, result_code, result_text, started_on, ended_on,resource_id):
    conn.execute(text("""
        UPDATE automateconstructs
        SET StartedOn = :start,
            ModifiedOn = :last,
            ResultCode = :rcode,
            ResultText = :rtext,
            EndedOn = :end
        WHERE ResourceID = :rid
    """), {
        "start": started_on,
        "last": modified_on,
        "rcode": result_code,
        "rtext": result_text,
        "end": ended_on,
        "rid": resource_id
    })

def actualizar_FinConstruct(conn, *, construct_id, end_time, result_code, result_text):
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
        "rtext": result_text,
        "succ": 1 if result_code == 1 else 0,
        "fail": 1 if result_code != 1 else 0,
        "rid": construct_id
    })

def actualizar_FinInstance(conn, *, instance_id, end_time, duration, final_status, result_code, result_text):
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
        "rtext": result_text,
        "instance": instance_id
    })



#### SIMULACION DE EJECUCION DE TAREAS Y WORKFLOWS ####
def simular_ejecucion():
    try:
        if shutdown_event.is_set():
            return

        item = random.choice(catalog)

        #TAREA
        task_id = item["task_id"]
        task_name = item["task_name"]
        task_path = item["task_path"] or r"\TASKS\Procesos\\"
        task_agent_id = item["task_agent_id"] or "1b271033-0bc2-4cd0-bac5-df25bfa35b33"
        task_agent_name = item["task_agent_name"] or "BS-ROBOT01"
        task_agent_path = item["task_agent_path"] or r"\TASKAGENTS"

        #WORKFLOW
        wf_construct_id = item["workflow_construct_id"]
        wf_name = item["workflow_name"]
        wf_path = item["workflow_path"] or r"\WORKFLOWS\\"

        #GLOBALES
        now = datetime.now()
        duration = random.randint(100, 180)
        transaction_id = str(uuid.uuid4())

        # Se genera SIEMPRE un workflow_instance_id por corrida
        workflow_instance_id = str(uuid.uuid4())

        # Regla: workflow InstanceID == WorkflowInstanceID
        wf_instance_id = workflow_instance_id

        # Task instance id propio
        task_instance_id = str(uuid.uuid4())

        # Estado final compartido (puedes diferenciarlo si quieres)
        final_status = random.choices([1, 2, 7], weights=[0.8, 0.15, 0.05])[0]
        result_code = final_status

        task_text = {
            1: f"Task '{task_name}' running on agent '{task_agent_name}' completed successfully.",
            2: f"Task '{task_name}' running on agent '{task_agent_name}' failed.",
            7: f"Task '{task_name}' timed out.",
            12: f"Task '{task_name}' running on agent '{task_agent_name}' ..."
        }

        #### Para el caso de los Workflows
        tiene_workflow = bool(wf_construct_id and wf_name)

        wf_text = None
        if tiene_workflow:
            wf_text = {
                1: f"Workflow '{wf_name}' completed successfully.",
                2: f"Workflow '{wf_name}' failed because: Missing or ambiguous starting point",
                7: f"Workflow '{wf_name}' timed out.",
                12: f"Workflow '{wf_name}' running..."
            }


        #### INICIO DE SIMULACION ####
        with engine.begin() as conn:
            
            # WORKFLOW START
            if tiene_workflow:
                ev_wf_rowid = siguienteRowID_ExecEvent(conn)
                insertar_ExecutionEvent(
                    conn,
                    event_id=str(uuid.uuid4()),
                    construct_id=wf_construct_id,
                    start_dt=now,
                    end_dt=now,
                    result_code=12,
                    result_text=wf_text[12],
                    instance_id=wf_instance_id,
                    agent_id=None,
                    rowid=ev_wf_rowid,
                    transaction_id=transaction_id,
                    workflow_instance_id=wf_instance_id,
                )

                wf_rowid = siguienteRowID_Instances(conn)
                insertar_Instance(
                    conn,
                    rowid=wf_rowid,
                    record_id=str(uuid.uuid4()),
                    instance_id=wf_instance_id,
                    transaction_id=transaction_id,
                    workflow_instance_id=wf_instance_id,
                    construct_id=wf_construct_id,
                    construct_type=3,
                    construct_name=wf_name,
                    construct_path=wf_path,
                    agent_id=None,
                    agent_name=None,
                    agent_path=None,
                    start_dt=now,
                    end_dt='1900-01-01 00:00:00.0000000'
                )

                actualizar_InicioConstruct(
                    conn, 
                    modified_on=now,
                    result_code=0,
                    result_text=None,
                    started_on=now,
                    ended_on='1900-01-01 00:00:00.0000000',
                    resource_id = wf_construct_id
                    )

            
            # TASK START
            ev_task_rowid = siguienteRowID_ExecEvent(conn)
            insertar_ExecutionEvent(
                conn,
                event_id=str(uuid.uuid4()),
                construct_id=task_id,
                start_dt=now,
                end_dt=now,
                result_code=12,
                result_text=task_text[12],
                instance_id=task_instance_id,
                agent_id=task_agent_id,
                rowid=ev_task_rowid,
                transaction_id=transaction_id,
                workflow_instance_id=workflow_instance_id         
            )

            task_rowid = siguienteRowID_Instances(conn)
            insertar_Instance(
                conn,
                rowid=task_rowid,
                record_id=str(uuid.uuid4()),
                instance_id=task_instance_id,
                transaction_id=transaction_id,
                workflow_instance_id=workflow_instance_id,
                construct_id=task_id,
                construct_type=2,
                construct_name=task_name,
                construct_path=task_path,
                agent_id=task_agent_id,
                agent_name=task_agent_name,
                agent_path=task_agent_path,
                start_dt=now,
                end_dt='1900-01-01 00:00:00.0000000'
            )

            actualizar_InicioConstruct(
                    conn, 
                    modified_on=now,
                    result_code=0,
                    result_text=None,
                    started_on=now,
                    ended_on='1900-01-01 00:00:00.0000000',
                    resource_id = task_id
                    )
            

        # KAFKA (RUNNING TASKS)
        producer.send("rpa-execution-events", {
            "InstanceID": task_instance_id,
            "ConstructID": task_id,
            "ConstructName": task_name,
            "StartDateTime": now,
            "Status": 12,
            "ResultCode": -1,
            "TransactionID": transaction_id,
            "WorkflowInstanceID": workflow_instance_id
        })
        producer.flush()

        logging.info(
            f"RUNNING task={task_name} instance={task_instance_id} wf_instance={workflow_instance_id} wf_name={wf_name}"
        )


        #### ESPERA DE LA EJECUCION (simulamos duración)
        elapsed = 0.0
        while elapsed < duration and not shutdown_event.is_set():
            wait_chunk = min(0.5, duration - elapsed)
            time.sleep(wait_chunk)
            elapsed += wait_chunk


        #### FIN DE SIMULACION ####
        with engine.begin() as conn:

            end_time = datetime.now()
            duration_seconds = int((end_time - now).total_seconds())

            if shutdown_event.is_set():
                final_status = 2
                result_code = 2
                task_result_text = f"Task '{task_name}' interrupted by shutdown."
                wf_result_text = (
                    f"Workflow '{wf_name}' interrupted by shutdown."
                    if tiene_workflow else None
                )
            else:
                task_result_text = task_text[result_code]
                wf_result_text = wf_text[result_code] if tiene_workflow else None

            # TASK END
            ev_task_rowid_end = siguienteRowID_ExecEvent(conn)
            insertar_ExecutionEvent(
                conn,
                event_id=str(uuid.uuid4()),
                construct_id=task_id,
                instance_id=task_instance_id,
                agent_id=task_agent_id,
                rowid=ev_task_rowid_end,
                transaction_id=transaction_id,
                workflow_instance_id=workflow_instance_id,
                start_dt=now,
                end_dt=end_time,
                result_code=result_code,
                result_text=task_result_text
            )

            actualizar_FinInstance(
                conn,
                instance_id=task_instance_id,
                end_time=end_time,
                duration=duration_seconds,
                final_status=final_status,
                result_code=result_code,
                result_text=task_result_text
            )

            actualizar_FinConstruct(
                conn,
                construct_id=task_id,
                end_time=end_time,
                result_code=result_code,
                result_text=task_result_text
            )

            # WORKFLOW END
            if tiene_workflow:
                ev_wf_rowid_end = siguienteRowID_ExecEvent(conn)
                insertar_ExecutionEvent(
                    conn,
                    event_id=str(uuid.uuid4()),
                    construct_id=wf_construct_id,
                    instance_id=wf_instance_id,
                    agent_id=None,
                    rowid=ev_wf_rowid_end,
                    transaction_id=transaction_id,
                    workflow_instance_id=wf_instance_id,
                    start_dt=end_time,
                    end_dt=end_time,
                    result_code=result_code,
                    result_text=wf_result_text
                )

                actualizar_FinInstance(
                    conn,
                    instance_id=wf_instance_id,
                    end_time=end_time,
                    duration=duration_seconds,
                    final_status=final_status,
                    result_code=result_code,
                    result_text=wf_result_text
                )

                actualizar_FinConstruct(
                    conn,
                    construct_id=wf_construct_id,
                    end_time=end_time,
                    result_code=result_code,
                    result_text=wf_result_text
                )


        # Kafka summary (task)
        producer.send("rpa-instance-summary", {
            "InstanceID": task_instance_id,
            "ConstructID": task_id,
            "ConstructName": task_name,
            "StartDateTime": now,
            "EndDateTime": end_time,
            "Duration": duration_seconds,
            "Status": final_status,
            "ResultCode": result_code,
            "Success": result_code == 1,
            "WorkflowInstanceID": workflow_instance_id,
            "WorkflowName": wf_name
        })
        producer.flush()

        logging.info(f"FINAL task={task_name} => {task_result_text} wf_name={wf_name}")

    except Exception:
        logging.exception("Error en simular_ejecucion()")

def ejecucion_concurrente(concurrency, spawn_interval):
    """
    Lanza ejecuciones en paralelo sin esperar a que termine una para iniciar otra.
    - concurrency: máximo de ejecuciones simultáneas
    - spawn_interval: cada cuántos segundos se inicia una nueva ejecución
    """
    logging.info(f"Modo concurrente: concurrency={concurrency}, spawn_interval={spawn_interval}s")

    #Generar hilos de ejecucion
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        # Semáforo para no sobrepasar concurrencia (doble control)
        sem = threading.Semaphore(concurrency)

        def _wrapped_run():
            # Asegura liberar cupo al terminar aunque haya error
            try:
                simular_ejecucion()
            finally:
                sem.release()

        try:
            while not shutdown_event.is_set():
                if not sem.acquire(timeout=0.5):
                    continue

                if shutdown_event.is_set():
                    sem.release()
                    break

                executor.submit(_wrapped_run)

                wait_until = time.time() + spawn_interval
                while time.time() < wait_until and not shutdown_event.is_set():
                    time.sleep(0.2)
        except KeyboardInterrupt:
            shutdown_event.set()
            logging.info("Interrupcion detectada. Marcando ejecuciones activas como fallo...")


if __name__ == "__main__":
    while not shutdown_event.is_set():
        try:
            ejecucion_concurrente(concurrency=3, spawn_interval=2)
        except KeyboardInterrupt:
            shutdown_event.set()
            logging.info("Ctrl+C recibido. Finalizando ejecuciones activas como fallo...")
        except Exception:
            logging.exception("Error en proceso de Simulacion")
            time.sleep(5)
