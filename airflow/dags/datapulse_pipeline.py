from datetime import datetime, timedelta
import logging
import os
import time

from dotenv import load_dotenv
import psycopg2

from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator


# Load DataPulse environment variables
load_dotenv(
    "/mnt/c/Users/kingw/OneDrive/Desktop/datapulse/.env"
)


logger = logging.getLogger(__name__)


# Read database configuration from .env
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")


# Validate required environment variables
required_variables = {
    "DB_HOST": DB_HOST,
    "DB_PORT": DB_PORT,
    "DB_NAME": DB_NAME,
    "DB_USER": DB_USER,
    "DB_PASSWORD": DB_PASSWORD,
}


missing_variables = [
    name
    for name, value in required_variables.items()
    if not value
]


if missing_variables:
    raise RuntimeError(
        "Missing database environment variables: "
        + ", ".join(missing_variables)
    )


DB_CONFIG = {
    "host": DB_HOST,
    "port": int(DB_PORT),
    "database": DB_NAME,
    "user": DB_USER,
    "password": DB_PASSWORD,
}


def get_connection():
    return psycopg2.connect(**DB_CONFIG)


def run_etl():
    start_time = time.time()

    logger.info("========================================")
    logger.info("DataPulse Olist ETL started")
    logger.info("Connecting to PostgreSQL...")
    logger.info("========================================")

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()

        logger.info("PostgreSQL connection successful")

        logger.info("Testing warehouse schema...")

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = 'warehouse'
              AND table_name IN (
                  'daily_sales',
                  'category_sales',
                  'state_sales'
              );
            """
        )

        warehouse_table_count = cursor.fetchone()[0]

        if warehouse_table_count != 3:
            raise RuntimeError(
                "Warehouse tables are missing."
            )

        logger.info(
            "Warehouse schema verified: %s tables",
            warehouse_table_count,
        )

        logger.info(
            "Clearing previous warehouse data..."
        )

        cursor.execute(
            """
            TRUNCATE TABLE
                warehouse.daily_sales,
                warehouse.category_sales,
                warehouse.state_sales;
            """
        )

        logger.info("Warehouse tables cleared")

        logger.info(
            "Building daily sales aggregation..."
        )

        cursor.execute(
            """
            INSERT INTO warehouse.daily_sales (
                sale_date,
                orders_count,
                items_count,
                revenue
            )
            SELECT
                o.order_purchase_timestamp::timestamp::date,
                COUNT(DISTINCT o.order_id),
                COUNT(oi.order_item_id),
                COALESCE(SUM(oi.price), 0)
            FROM public.olist_orders o
            JOIN public.olist_order_items oi
                ON o.order_id = oi.order_id
            WHERE o.order_status = 'delivered'
            GROUP BY
                o.order_purchase_timestamp::timestamp::date;
            """
        )

        logger.info(
            "Daily sales rows inserted: %s",
            cursor.rowcount,
        )

        logger.info(
            "Building category sales aggregation..."
        )

        cursor.execute(
            """
            INSERT INTO warehouse.category_sales (
                category_name,
                orders_count,
                items_count,
                revenue
            )
            SELECT
                COALESCE(
                    pct.product_category_name_english,
                    p.product_category_name,
                    'Unknown'
                ),
                COUNT(DISTINCT o.order_id),
                COUNT(oi.order_item_id),
                COALESCE(SUM(oi.price), 0)
            FROM public.olist_orders o
            JOIN public.olist_order_items oi
                ON o.order_id = oi.order_id
            JOIN public.olist_products p
                ON oi.product_id = p.product_id
            LEFT JOIN public.product_category_translation pct
                ON p.product_category_name =
                   pct.product_category_name
            WHERE o.order_status = 'delivered'
            GROUP BY
                COALESCE(
                    pct.product_category_name_english,
                    p.product_category_name,
                    'Unknown'
                );
            """
        )

        logger.info(
            "Category sales rows inserted: %s",
            cursor.rowcount,
        )

        logger.info(
            "Building state sales aggregation..."
        )

        cursor.execute(
            """
            INSERT INTO warehouse.state_sales (
                customer_state,
                orders_count,
                items_count,
                revenue
            )
            SELECT
                c.customer_state,
                COUNT(DISTINCT o.order_id),
                COUNT(oi.order_item_id),
                COALESCE(SUM(oi.price), 0)
            FROM public.olist_orders o
            JOIN public.olist_customers c
                ON o.customer_id = c.customer_id
            JOIN public.olist_order_items oi
                ON o.order_id = oi.order_id
            WHERE o.order_status = 'delivered'
            GROUP BY c.customer_state;
            """
        )

        logger.info(
            "State sales rows inserted: %s",
            cursor.rowcount,
        )

        logger.info(
            "Running warehouse validation..."
        )

        cursor.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM warehouse.daily_sales),
                (SELECT COUNT(*) FROM warehouse.category_sales),
                (SELECT COUNT(*) FROM warehouse.state_sales);
            """
        )

        (
            daily_count,
            category_count,
            state_count,
        ) = cursor.fetchone()

        logger.info(
            "daily_sales: %s rows",
            daily_count,
        )

        logger.info(
            "category_sales: %s rows",
            category_count,
        )

        logger.info(
            "state_sales: %s rows",
            state_count,
        )

        if daily_count == 0:
            raise RuntimeError(
                "daily_sales contains no rows."
            )

        if category_count == 0:
            raise RuntimeError(
                "category_sales contains no rows."
            )

        if state_count == 0:
            raise RuntimeError(
                "state_sales contains no rows."
            )

        connection.commit()

        elapsed = time.time() - start_time

        logger.info(
            "========================================"
        )

        logger.info(
            "DataPulse Olist ETL completed successfully"
        )

        logger.info(
            "Execution time: %.2f seconds",
            elapsed,
        )

        logger.info(
            "========================================"
        )

    except Exception as error:
        if connection:
            connection.rollback()

        logger.exception(
            "DataPulse Olist ETL failed: %s",
            error,
        )

        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()

        logger.info(
            "PostgreSQL connection closed"
        )


def quality_check():
    logger.info("========================================")
    logger.info(
        "DataPulse data quality check started"
    )
    logger.info("========================================")

    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor()

        logger.info(
            "Checking warehouse row counts..."
        )

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.daily_sales;
            """
        )

        daily_count = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.category_sales;
            """
        )

        category_count = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.state_sales;
            """
        )

        state_count = cursor.fetchone()[0]

        logger.info(
            "daily_sales rows: %s",
            daily_count,
        )

        logger.info(
            "category_sales rows: %s",
            category_count,
        )

        logger.info(
            "state_sales rows: %s",
            state_count,
        )

        if daily_count <= 0:
            raise ValueError(
                "Quality check failed: "
                "daily_sales is empty."
            )

        if category_count <= 0:
            raise ValueError(
                "Quality check failed: "
                "category_sales is empty."
            )

        if state_count <= 0:
            raise ValueError(
                "Quality check failed: "
                "state_sales is empty."
            )

        logger.info(
            "Checking for negative revenue..."
        )

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.daily_sales
            WHERE revenue < 0;
            """
        )

        negative_daily_revenue = (
            cursor.fetchone()[0]
        )

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.category_sales
            WHERE revenue < 0;
            """
        )

        negative_category_revenue = (
            cursor.fetchone()[0]
        )

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.state_sales
            WHERE revenue < 0;
            """
        )

        negative_state_revenue = (
            cursor.fetchone()[0]
        )

        logger.info(
            "Negative daily revenue rows: %s",
            negative_daily_revenue,
        )

        logger.info(
            "Negative category revenue rows: %s",
            negative_category_revenue,
        )

        logger.info(
            "Negative state revenue rows: %s",
            negative_state_revenue,
        )

        if negative_daily_revenue > 0:
            raise ValueError(
                "Quality check failed: "
                "negative daily revenue."
            )

        if negative_category_revenue > 0:
            raise ValueError(
                "Quality check failed: "
                "negative category revenue."
            )

        if negative_state_revenue > 0:
            raise ValueError(
                "Quality check failed: "
                "negative state revenue."
            )

        logger.info(
            "Checking order and item counts..."
        )

        cursor.execute(
            """
            SELECT
                COALESCE(
                    SUM(orders_count),
                    0
                ),
                COALESCE(
                    SUM(items_count),
                    0
                ),
                COALESCE(
                    SUM(revenue),
                    0
                )
            FROM warehouse.daily_sales;
            """
        )

        (
            total_orders,
            total_items,
            total_revenue,
        ) = cursor.fetchone()

        logger.info(
            "Total orders: %s",
            total_orders,
        )

        logger.info(
            "Total items: %s",
            total_items,
        )

        logger.info(
            "Total revenue: %.2f",
            total_revenue,
        )

        if total_orders <= 0:
            raise ValueError(
                "Quality check failed: "
                "total orders is zero."
            )

        if total_items <= 0:
            raise ValueError(
                "Quality check failed: "
                "total items is zero."
            )

        if total_revenue <= 0:
            raise ValueError(
                "Quality check failed: "
                "total revenue is zero."
            )

        logger.info(
            "Checking invalid order counts..."
        )

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.daily_sales
            WHERE orders_count <= 0
               OR items_count <= 0;
            """
        )

        invalid_daily_rows = (
            cursor.fetchone()[0]
        )

        if invalid_daily_rows > 0:
            raise ValueError(
                "Quality check failed: "
                "invalid daily sales counts."
            )

        logger.info(
            "Checking category counts..."
        )

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.category_sales
            WHERE orders_count <= 0
               OR items_count <= 0;
            """
        )

        invalid_category_rows = (
            cursor.fetchone()[0]
        )

        if invalid_category_rows > 0:
            raise ValueError(
                "Quality check failed: "
                "invalid category counts."
            )

        logger.info(
            "Checking state counts..."
        )

        cursor.execute(
            """
            SELECT COUNT(*)
            FROM warehouse.state_sales
            WHERE orders_count <= 0
               OR items_count <= 0;
            """
        )

        invalid_state_rows = (
            cursor.fetchone()[0]
        )

        if invalid_state_rows > 0:
            raise ValueError(
                "Quality check failed: "
                "invalid state counts."
            )

        logger.info(
            "All data quality checks passed"
        )

        logger.info(
            "========================================"
        )

        logger.info(
            "DataPulse data quality check "
            "completed successfully"
        )

        logger.info(
            "========================================"
        )

    except Exception as error:
        logger.exception(
            "DataPulse data quality check failed: %s",
            error,
        )

        raise

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()

        logger.info(
            "Quality check PostgreSQL "
            "connection closed"
        )


with DAG(
    dag_id="datapulse_pipeline",
    start_date=datetime(2026, 1, 1),
    schedule="0 2 * * *",
    catchup=False,
    default_args={
        "owner": "datapulse",
        "retries": 2,
        "retry_delay": timedelta(
            minutes=5
        ),
    },
    max_active_runs=1,
    tags=[
        "datapulse",
        "etl",
        "olist",
        "production",
    ],
) as dag:

    etl_task = PythonOperator(
        task_id="run_olist_etl",
        python_callable=run_etl,
    )

    quality_task = PythonOperator(
        task_id="quality_check",
        python_callable=quality_check,
    )

    etl_task >> quality_task