
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

PROJECT_ROOT = Path(__file__).resolve().parent.parent
API_PATH = PROJECT_ROOT / "api"

sys.path.insert(0, str(API_PATH))

from database import engine
from main import app


client = TestClient(app)


def database_available():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.fixture
def require_database():
    if not database_available():
        pytest.skip("PostgreSQL database is not available")


@pytest.mark.parametrize(
    "endpoint",
    [
        "/olist/analytics/summary",
        "/olist/analytics/states",
        "/olist/analytics/categories",
        "/olist/analytics/trend",
    ],
)
def test_analytics_endpoints(endpoint, require_database):
    response = client.get(endpoint)

    assert response.status_code == 200
    assert response.json() is not None
