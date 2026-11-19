import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def _client(seed: bool):
    app = create_app(Settings(database_url="sqlite://", seed_demo_data=seed))
    with TestClient(app) as client:
        yield client


@pytest.fixture
def client():
    yield from _client(seed=False)


@pytest.fixture
def seeded_client():
    yield from _client(seed=True)


@pytest.fixture
def make_supplier(client):
    counter = iter(range(1, 10_000))

    def _make(**overrides):
        payload = {"name": f"Supplier {next(counter)}", "country": "Netherlands"} | overrides
        response = client.post("/api/suppliers", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _make


@pytest.fixture
def make_product(client):
    counter = iter(range(1, 10_000))

    def _make(**overrides):
        n = next(counter)
        payload = {
            "sku": f"TST-{n:04d}",
            "name": f"Test product {n}",
            "category": "Tools",
            "unit": "pcs",
            "cost_price": 10,
            "sale_price": 25,
            "reorder_level": 5,
        } | overrides
        response = client.post("/api/products", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _make


@pytest.fixture
def move(client):
    def _move(product_id: int, type: str, quantity: int, **extra):
        return client.post(
            f"/api/products/{product_id}/movements",
            json={"type": type, "quantity": quantity} | extra,
        )

    return _move
