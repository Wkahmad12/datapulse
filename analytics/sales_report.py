import pandas as pd
from sqlalchemy import create_engine

DATABASE_URL = "postgresql+psycopg2://postgres:DataPulse%402026@localhost:5432/datapulse"

engine = create_engine(DATABASE_URL)

query = """
SELECT
    order_date,
    total_orders,
    total_units,
    total_revenue
FROM daily_sales
ORDER BY order_date;
"""

sales = pd.read_sql(query, engine)

print("DAILY SALES REPORT")
print(sales)

print("\nTOTAL REVENUE")
print(sales["total_revenue"].sum())

print("\nTOTAL UNITS SOLD")
print(sales["total_units"].sum())