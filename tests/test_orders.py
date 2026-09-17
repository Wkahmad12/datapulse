import pandas as pd

orders = pd.read_csv("data/orders.csv")

assert orders["order_id"].notnull().all()
assert orders["customer"].notnull().all()
assert orders["product"].notnull().all()
assert orders["quantity"].gt(0).all()
assert orders["price"].ge(0).all()

print("All data quality checks passed")