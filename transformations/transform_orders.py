import pandas as pd

file_path = "data/orders.csv"

orders = pd.read_csv(file_path)

orders["order_date"] = pd.to_datetime(orders["order_date"])

orders["revenue"] = orders["quantity"] * orders["price"]

print(orders)