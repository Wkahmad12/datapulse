
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


def test_root_endpoint():
    response = client.get("/")

    assert response.status_code == 200


def test_health_endpoint(require_database):
    response = client.get("/health")

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "healthy"
    assert data["database"] == "PostgreSQL"
    assert data["dataset"] == "Olist"


def test_olist_filters_endpoint(require_database):
    response = client.get("/olist/filters")

    assert response.status_code == 200

    data = response.json()

    assert "states" in data
    assert "categories" in data
