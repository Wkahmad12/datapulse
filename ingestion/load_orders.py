import pandas as pd

file_path = "data/orders.csv"

orders = pd.read_csv(file_path)

print("FIRST 5 ROWS")
print(orders.head())

print("\nDATASET SHAPE")
print(orders.shape)

print("\nCOLUMN NAMES")
print(orders.columns.tolist())

print("\nDATA TYPES")
print(orders.dtypes)

print("\nMISSING VALUES")
print(orders.isnull().sum())

print("\nDUPLICATE ROWS")
print(orders.duplicated().sum())

print("\nSTATISTICS")
print(orders.describe())