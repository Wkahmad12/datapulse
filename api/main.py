from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from sqlalchemy import text

from database import engine


app = FastAPI(
    title="DataPulse API",
    description="E-commerce Data Engineering and Analytics API",
    version="5.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_raw_filters(
    start_date: Optional[str],
    end_date: Optional[str],
    state: Optional[str],
    category: Optional[str],
    order_status: str,
    search: Optional[str],
):
    conditions = ["1=1"]
    params = {}

    if start_date:
        conditions.append(
            "o.order_purchase_timestamp::timestamp >= CAST(:start_date AS timestamp)"
        )
        params["start_date"] = start_date

    if end_date:
        conditions.append(
            "o.order_purchase_timestamp::timestamp < "
            "CAST(:end_date AS date) + INTERVAL '1 day'"
        )
        params["end_date"] = end_date

    if state:
        conditions.append(
            "c.customer_state = :state"
        )
        params["state"] = state

    if category:
        if category.lower() == "unknown":
            conditions.append(
                """
                p.product_category_name IS NULL
                AND pct.product_category_name_english IS NULL
                """
            )
        else:
            conditions.append(
                """
                COALESCE(
                    pct.product_category_name_english,
                    p.product_category_name,
                    'Unknown'
                ) = :category
                """
            )
            params["category"] = category

    if order_status and order_status.lower() != "all":
        conditions.append(
            "o.order_status = :order_status"
        )
        params["order_status"] = order_status

    if search:
        conditions.append(
            """
            (
                c.customer_state ILIKE :search
                OR p.product_category_name ILIKE :search
                OR pct.product_category_name_english ILIKE :search
            )
            """
        )
        params["search"] = f"%{search}%"

    return " AND ".join(conditions), params


def can_use_warehouse(
    start_date: Optional[str],
    end_date: Optional[str],
    state: Optional[str],
    category: Optional[str],
    order_status: str,
    search: Optional[str],
):
    """
    Warehouse aggregate tables represent delivered orders
    across the complete dataset.

    Use them only when no additional filter requires
    row-level Olist data.
    """

    return (
        not start_date
        and not end_date
        and not state
        and not category
        and not search
        and order_status.lower() == "delivered"
    )


@app.get("/")
def root():
    return {
        "message": "DataPulse API is running",
        "version": "5.0.0",
        "dataset": "Olist Brazilian E-Commerce",
        "architecture": "Raw Data -> Airflow ETL -> Warehouse -> FastAPI -> React",
    }


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:

            connection.execute(
                text("SELECT 1")
            )

            warehouse_check = connection.execute(
                text(
                    """
                    SELECT
                        EXISTS (
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_schema = 'warehouse'
                            AND table_name = 'daily_sales'
                        ) AS daily_exists,

                        EXISTS (
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_schema = 'warehouse'
                            AND table_name = 'category_sales'
                        ) AS category_exists,

                        EXISTS (
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_schema = 'warehouse'
                            AND table_name = 'state_sales'
                        ) AS state_exists
                    """
                )
            ).fetchone()

        warehouse_ready = all(
            [
                warehouse_check.daily_exists,
                warehouse_check.category_exists,
                warehouse_check.state_exists,
            ]
        )

        return {
            "status": "healthy",
            "database": "PostgreSQL",
            "dataset": "Olist",
            "connection": "successful",
            "warehouse": (
                "ready"
                if warehouse_ready
                else "incomplete"
            ),
        }

    except Exception as error:
        return {
            "status": "unhealthy",
            "database": "PostgreSQL",
            "error": str(error),
        }


@app.get("/olist/filters")
def olist_filters():

    with engine.connect() as connection:

        states_result = connection.execute(
            text(
                """
                SELECT customer_state
                FROM warehouse.state_sales
                WHERE customer_state IS NOT NULL
                ORDER BY customer_state
                """
            )
        )

        categories_result = connection.execute(
            text(
                """
                SELECT category_name
                FROM warehouse.category_sales
                WHERE category_name IS NOT NULL
                ORDER BY category_name
                """
            )
        )

        statuses_result = connection.execute(
            text(
                """
                SELECT DISTINCT order_status
                FROM public.olist_orders
                WHERE order_status IS NOT NULL
                ORDER BY order_status
                """
            )
        )

        dates_result = connection.execute(
            text(
                """
                SELECT
                    MIN(sale_date) AS min_date,
                    MAX(sale_date) AS max_date
                FROM warehouse.daily_sales
                """
            )
        )

        states = [
            row[0]
            for row in states_result
        ]

        categories = [
            row[0]
            for row in categories_result
        ]

        statuses = [
            row[0]
            for row in statuses_result
        ]

        dates = dates_result.fetchone()

    return {
        "states": states,
        "categories": categories,
        "statuses": statuses,
        "date_range": {
            "min": (
                str(dates.min_date)
                if dates.min_date
                else None
            ),
            "max": (
                str(dates.max_date)
                if dates.max_date
                else None
            ),
        },
    }


@app.get("/olist/analytics/summary")
def olist_analytics_summary(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    order_status: str = Query("delivered"),
    search: Optional[str] = Query(None),
):

    use_warehouse = can_use_warehouse(
        start_date,
        end_date,
        state,
        category,
        order_status,
        search,
    )

    with engine.connect() as connection:

        if use_warehouse:

            query = text(
                """
                SELECT
                    COALESCE(
                        SUM(orders_count),
                        0
                    ) AS total_orders,

                    COALESCE(
                        SUM(items_count),
                        0
                    ) AS total_items,

                    COALESCE(
                        SUM(revenue),
                        0
                    ) AS total_revenue,

                    COALESCE(
                        SUM(revenue)
                        / NULLIF(
                            SUM(items_count),
                            0
                        ),
                        0
                    ) AS average_item_price

                FROM warehouse.daily_sales
                """
            )

            row = connection.execute(
                query
            ).fetchone()

        else:

            conditions, params = build_raw_filters(
                start_date,
                end_date,
                state,
                category,
                order_status,
                search,
            )

            query = text(
                f"""
                SELECT

                    COUNT(
                        DISTINCT o.order_id
                    ) AS total_orders,

                    COUNT(
                        oi.order_item_id
                    ) AS total_items,

                    COALESCE(
                        SUM(oi.price),
                        0
                    ) AS total_revenue,

                    COALESCE(
                        AVG(oi.price),
                        0
                    ) AS average_item_price

                FROM public.olist_orders o

                JOIN public.olist_customers c
                    ON o.customer_id =
                       c.customer_id

                JOIN public.olist_order_items oi
                    ON o.order_id =
                       oi.order_id

                JOIN public.olist_products p
                    ON oi.product_id =
                       p.product_id

                LEFT JOIN
                    public.product_category_translation pct
                    ON p.product_category_name =
                       pct.product_category_name

                WHERE {conditions}
                """
            )

            row = connection.execute(
                query,
                params,
            ).fetchone()

    return {
        "total_orders": int(
            row.total_orders or 0
        ),
        "total_items": int(
            row.total_items or 0
        ),
        "total_revenue": float(
            row.total_revenue or 0
        ),
        "average_item_price": float(
            row.average_item_price or 0
        ),
    }


@app.get("/olist/analytics/states")
def olist_analytics_states(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    order_status: str = Query("delivered"),
    search: Optional[str] = Query(None),
):

    use_warehouse = can_use_warehouse(
        start_date,
        end_date,
        state,
        category,
        order_status,
        search,
    )

    with engine.connect() as connection:

        if use_warehouse:

            query = text(
                """
                SELECT
                    customer_state AS state,

                    SUM(orders_count)
                        AS total_orders,

                    SUM(revenue)
                        AS total_revenue

                FROM warehouse.state_sales

                GROUP BY customer_state

                ORDER BY total_revenue DESC
                """
            )

            result = connection.execute(
                query
            )

        else:

            conditions, params = build_raw_filters(
                start_date,
                end_date,
                state,
                category,
                order_status,
                search,
            )

            query = text(
                f"""
                SELECT

                    c.customer_state
                        AS state,

                    COUNT(
                        DISTINCT o.order_id
                    ) AS total_orders,

                    COALESCE(
                        SUM(oi.price),
                        0
                    ) AS total_revenue

                FROM public.olist_orders o

                JOIN public.olist_customers c
                    ON o.customer_id =
                       c.customer_id

                JOIN public.olist_order_items oi
                    ON o.order_id =
                       oi.order_id

                JOIN public.olist_products p
                    ON oi.product_id =
                       p.product_id

                LEFT JOIN
                    public.product_category_translation pct
                    ON p.product_category_name =
                       pct.product_category_name

                WHERE {conditions}

                GROUP BY
                    c.customer_state

                ORDER BY
                    total_revenue DESC
                """
            )

            result = connection.execute(
                query,
                params,
            )

        states = [
            dict(row._mapping)
            for row in result
        ]

    for item in states:
        item["total_orders"] = int(
            item["total_orders"] or 0
        )

        item["total_revenue"] = float(
            item["total_revenue"] or 0
        )

    return {
        "count": len(states),
        "states": states,
    }


@app.get("/olist/analytics/categories")
def olist_analytics_categories(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    order_status: str = Query("delivered"),
    search: Optional[str] = Query(None),
):

    use_warehouse = can_use_warehouse(
        start_date,
        end_date,
        state,
        category,
        order_status,
        search,
    )

    with engine.connect() as connection:

        if use_warehouse:

            query = text(
                """
                SELECT

                    category_name
                        AS category,

                    items_count
                        AS items_sold,

                    revenue
                        AS total_revenue

                FROM warehouse.category_sales

                ORDER BY total_revenue DESC

                LIMIT 20
                """
            )

            result = connection.execute(
                query
            )

        else:

            conditions, params = build_raw_filters(
                start_date,
                end_date,
                state,
                category,
                order_status,
                search,
            )

            query = text(
                f"""
                SELECT

                    COALESCE(
                        pct.product_category_name_english,
                        p.product_category_name,
                        'Unknown'
                    ) AS category,

                    COUNT(
                        oi.order_item_id
                    ) AS items_sold,

                    COALESCE(
                        SUM(oi.price),
                        0
                    ) AS total_revenue

                FROM public.olist_order_items oi

                JOIN public.olist_products p
                    ON oi.product_id =
                       p.product_id

                JOIN public.olist_orders o
                    ON oi.order_id =
                       o.order_id

                JOIN public.olist_customers c
                    ON o.customer_id =
                       c.customer_id

                LEFT JOIN
                    public.product_category_translation pct
                    ON p.product_category_name =
                       pct.product_category_name

                WHERE {conditions}

                GROUP BY
                    COALESCE(
                        pct.product_category_name_english,
                        p.product_category_name,
                        'Unknown'
                    )

                ORDER BY
                    total_revenue DESC

                LIMIT 20
                """
            )

            result = connection.execute(
                query,
                params,
            )

        categories = [
            dict(row._mapping)
            for row in result
        ]

    for item in categories:
        item["items_sold"] = int(
            item["items_sold"] or 0
        )

        item["total_revenue"] = float(
            item["total_revenue"] or 0
        )

    return {
        "count": len(categories),
        "categories": categories,
    }


@app.get("/olist/analytics/trend")
def olist_analytics_trend(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    order_status: str = Query("delivered"),
    search: Optional[str] = Query(None),
):

    use_warehouse = can_use_warehouse(
        start_date,
        end_date,
        state,
        category,
        order_status,
        search,
    )

    with engine.connect() as connection:

        if use_warehouse:

            query = text(
                """
                SELECT

                    sale_date AS date,

                    orders_count
                        AS total_orders,

                    items_count
                        AS total_items,

                    revenue
                        AS total_revenue

                FROM warehouse.daily_sales

                ORDER BY sale_date
                """
            )

            result = connection.execute(
                query
            )

        else:

            conditions, params = build_raw_filters(
                start_date,
                end_date,
                state,
                category,
                order_status,
                search,
            )

            query = text(
                f"""
                SELECT

                    DATE(
                        o.order_purchase_timestamp::timestamp
                    ) AS date,

                    COUNT(
                        DISTINCT o.order_id
                    ) AS total_orders,

                    COUNT(
                        oi.order_item_id
                    ) AS total_items,

                    COALESCE(
                        SUM(oi.price),
                        0
                    ) AS total_revenue

                FROM public.olist_orders o

                JOIN public.olist_customers c
                    ON o.customer_id =
                       c.customer_id

                JOIN public.olist_order_items oi
                    ON o.order_id =
                       oi.order_id

                JOIN public.olist_products p
                    ON oi.product_id =
                       p.product_id

                LEFT JOIN
                    public.product_category_translation pct
                    ON p.product_category_name =
                       pct.product_category_name

                WHERE {conditions}

                GROUP BY
                    DATE(
                        o.order_purchase_timestamp::timestamp
                    )

                ORDER BY date
                """
            )

            result = connection.execute(
                query,
                params,
            )

        trend = [
            dict(row._mapping)
            for row in result
        ]

    for item in trend:
        item["date"] = str(
            item["date"]
        )

        item["total_orders"] = int(
            item["total_orders"] or 0
        )

        item["total_items"] = int(
            item["total_items"] or 0
        )

        item["total_revenue"] = float(
            item["total_revenue"] or 0
        )

    return {
        "count": len(trend),
        "trend": trend,
    }