import pandas as pd
from sqlalchemy import create_engine

DATABASE_URL = "postgresql+psycopg2://postgres:DataPulse%402026@localhost:5432/datapulse"

engine = create_engine(DATABASE_URL)

orders = pd.read_csv("../data/orders.csv")

orders["order_date"] = pd.to_datetime(orders["order_date"])

orders["revenue"] = orders["quantity"] * orders["price"]

orders.to_sql(
    "orders",
    engine,
    if_exists="replace",
    index=False
)

print("Orders loaded successfully into PostgreSQL")