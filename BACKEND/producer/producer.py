import time
import json
import pandas as pd
from sqlalchemy import create_engine,text
from kafka import KafkaProducer
from dotenv import load_dotenv
import os
import logging


load_dotenv()

## Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

###  CONEXION SQL SERVER  ###
engine = create_engine(f"mssql+pymssql://@{os.getenv('DB_SERVER', 'localhost')}/{os.getenv('DB_NAME')}")

# Configurar productor Kafka
producer = KafkaProducer(
    bootstrap_servers=os.getenv("KAFKA_SERVER", "127.0.0.1:9092"),
    value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8')
)

last_timestamp = None

while True:
    try:
        if last_timestamp:
            last_ts_str = last_timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] if last_timestamp else "2000-01-01 00:00:00.000"
            query = f"""
            SELECT TOP 10
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
                i.Status
            FROM executionevents ee
            LEFT JOIN instances i ON ee.InstanceID = i.InstanceID
            LEFT JOIN automateconstructs ac ON i.ConstructID = ac.ResourceID
            WHERE 
                ac.ResourceType = 2 
                AND ac.CompletionState = 2 
                AND i.ConstructPath LIKE '%\\Procesos\\%'
                AND i.StartDateTime > '{last_ts_str}'
            ORDER BY StartDateTime ASC;
        """
        else:
            query = '''
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
                AND i.ConstructPath LIKE '%\\Procesos\\%')
            SELECT *
            FROM UltimaInstancia
            WHERE rn = 1
            ORDER BY StartDateTime ASC;
            
            '''

        df = pd.read_sql(query, engine)
        if not df.empty:
            logging.info(f"{len(df)} registros encontrados para enviar a Kafka.")

        for _, row in df.iterrows():
            last_timestamp = row['StartDateTime']
            event = row.to_dict()
            producer.send("instancias", event)
            logging.info(f"Evento enviado a Kafka: {event}")

    except Exception as e:
        logging.exception("Error en producer.py")

    time.sleep(5)