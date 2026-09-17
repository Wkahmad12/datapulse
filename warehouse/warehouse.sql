CREATE SCHEMA IF NOT EXISTS warehouse;

DROP TABLE IF EXISTS warehouse.daily_sales;
DROP TABLE IF EXISTS warehouse.category_sales;
DROP TABLE IF EXISTS warehouse.state_sales;

CREATE TABLE warehouse.daily_sales (
    sale_date DATE PRIMARY KEY,
    orders_count INTEGER NOT NULL,
    items_count INTEGER NOT NULL,
    revenue NUMERIC(14, 2) NOT NULL
);

CREATE TABLE warehouse.category_sales (
    category_name VARCHAR(255) PRIMARY KEY,
    orders_count INTEGER NOT NULL,
    items_count INTEGER NOT NULL,
    revenue NUMERIC(14, 2) NOT NULL
);

CREATE TABLE warehouse.state_sales (
    customer_state VARCHAR(2) PRIMARY KEY,
    orders_count INTEGER NOT NULL,
    items_count INTEGER NOT NULL,
    revenue NUMERIC(14, 2) NOT NULL
);