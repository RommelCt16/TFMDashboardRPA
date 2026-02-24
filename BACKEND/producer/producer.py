import time
import json
import os
import logging

import pandas as pd
from sqlalchemy import create_engine,text
from kafka import KafkaProducer
from dotenv import load_dotenv

#### Cargar variables de entorno desde .env  ####
load_dotenv()


#### Leer variables de .env ####
DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "")
KAFKA_SERVER = os.getenv("KAFKA_SERVER", "127.0.0.1:9092")

KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "instancias")
POLL_SECONDS = float(os.getenv("POLL_SECONDS", "5"))
BATCH_SIZE = max(1, int(os.getenv("BATCH_SIZE", "200")))
PATH_LIKE = os.getenv("PATH_LIKE", r"%\Procesos\%")


## Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)


###  CONEXION SQL SERVER  ###
engine = create_engine(f"mssql+pymssql://@{DB_SERVER}/{DB_NAME}")


# Configurar productor Kafka
producer = KafkaProducer(
    bootstrap_servers=KAFKA_SERVER,
    value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
    acks='all',
    retries=5
)

QUERY_RECURRENTE = text(f"""
SELECT TOP {BATCH_SIZE}
                i.InstanceID,
                i.ConstructID,
                i.ConstructName,
                i.StartDateTime,
                i.EndDateTime,
                ISNULL(i.Duration, DATEDIFF(SECOND, i.StartDateTime, GETDATE())) AS DurationSeconds,
                i.ResultCode,
                i.ConstructPath,
                SUBSTRING(
                    i.ConstructPath,
                    CHARINDEX('\\Procesos\\', i.ConstructPath) + LEN('\\Procesos\\'),
                    CHARINDEX('\\', i.ConstructPath + '\\', CHARINDEX('\\Procesos\\', i.ConstructPath) + LEN('\\Procesos\\')) 
                        - (CHARINDEX('\\Procesos\\', i.ConstructPath) + LEN('\\Procesos\\'))
                ) AS SubCarpeta,
                i.Status,
                i.RowID
            FROM instances i
            LEFT JOIN automateconstructs ac ON i.ConstructID = ac.ResourceID
            WHERE 
                ac.ResourceType = 2 
                AND ac.CompletionState = 2 
                AND i.ConstructPath LIKE :path_like
                AND (
                    i.StartDateTime > :last_ts
                    OR (i.StartDateTime = :last_ts AND i.RowID > :last_row_id)
                )
            ORDER BY i.StartDateTime ASC, i.RowID ASC;
""")


####   FILA --> EVENTO KAFKA   ####
def row_to_event(row):
    event = row.to_dict()
    event.pop("RowID", None)
    return event


# 6) Publicar un batch y avanzar checkpoint SOLO si Kafka confirma
def publish_df(df):
    """
    - Send() cada fila
    - Flush() para confirmar
    - Si flush OK, devolvemos nuevo checkpoint (end_time, rowid)
    """
    if df.empty:
        return None, None

    for _, row in df.iterrows():
        producer.send(KAFKA_TOPIC, row_to_event(row))

    # Si Kafka falla, flush lanza excepción => NO avanzamos checkpoint
    producer.flush()

    last = df.iloc[-1]
    new_last_start = last["StartDateTime"]
    new_last_rowid = int(last["RowID"])
    return new_last_start, new_last_rowid


#### MAIN LOOP: CONSULTA + PUBLICACION KAFKA + CHECKPOINT  ####
def main():
    last_timestamp = pd.Timestamp.now()
    last_row_id = 0

    logging.info(
            f"Producer iniciado | topic={KAFKA_TOPIC} | poll={POLL_SECONDS}s | batch={BATCH_SIZE}"
        )
    
    logging.info(f"Checkpoint inicial: last_timestamp={last_timestamp}, last_row_id={last_row_id}")
    

    #### Loop principal: cada X segundos, consulta incremental y publicación Kafka ####'
    while True:
        try:
            df = pd.read_sql(
                QUERY_RECURRENTE,
                engine,
                params={
                    "last_ts": last_timestamp,
                    "last_row_id": last_row_id,
                    "path_like": PATH_LIKE
                }
            )
            if not df.empty:
                logging.info(f"{len(df)} registros encontrados para enviar a Kafka.")
                new_timestamp, new_row_id = publish_df(df)
                if new_timestamp is not None:
                    last_timestamp = new_timestamp
                    last_row_id = new_row_id
                    logging.info(f"Checkpoint actualizado: last_timestamp={last_timestamp}, last_row_id={last_row_id}")

            time.sleep(POLL_SECONDS)

        except Exception:
            # Si falla SQL o Kafka, NO avanzamos checkpoint (reintenta)
            logging.exception("Error en loop incremental. Checkpoint se mantiene.")
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
