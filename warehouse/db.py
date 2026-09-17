from sqlalchemy import create_engine

DATABASE_URL = "postgresql+psycopg2://postgres:DataPulse%402026@localhost:5432/datapulse"

engine = create_engine(DATABASE_URL)

print("Database engine created successfully")