import pytest


def test_create_product_normalises_sku_and_starts_empty(client):
    response = client.post(
        "/api/products",
        json={"sku": " elc-100 ", "name": "Wireless mouse", "category": "Electronics"},
    )
    assert response.status_code == 201
    product = response.json()
    assert product["sku"] == "ELC-100"
    assert product["unit"] == "pcs"
    assert product["stock"] == 0
    assert product["stock_status"] == "out"
    assert product["supplier"] is None


def test_initial_stock_is_booked_as_a_movement(client, make_product):
    product = make_product(initial_stock=12, cost_price=2.5)
    assert product["stock"] == 12
    assert product["stock_value"] == 30
    assert product["stock_status"] == "in_stock"

    history = client.get(f"/api/products/{product['id']}/movements").json()
    assert history["total"] == 1
    opening = history["items"][0]
    assert opening["type"] == "in"
    assert opening["quantity"] == 12
    assert opening["balance_after"] == 12
    assert opening["note"] == "Opening stock"


def test_duplicate_sku_is_a_conflict(client, make_product):
    make_product(sku="DUP-1")
    response = client.post(
        "/api/products", json={"sku": "dup-1", "name": "Other", "category": "Tools"}
    )
    assert response.status_code == 409
    assert "DUP-1" in response.json()["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        {"sku": "", "name": "X", "category": "Tools"},
        {"sku": "has space", "name": "X", "category": "Tools"},
        {"sku": "OK-1", "name": "  ", "category": "Tools"},
        {"sku": "OK-1", "name": "X", "category": "Tools", "cost_price": -1},
        {"sku": "OK-1", "name": "X", "category": "Tools", "reorder_level": 1.5},
        {"sku": "OK-1", "name": "X", "category": "Tools", "unit": "crate"},
        {"sku": "OK-1", "name": "X", "category": "Tools", "initial_stock": -3},
        {"sku": "OK-1", "name": "X", "category": "Tools", "supplier_id": 99},
    ],
)
def test_invalid_products_are_rejected(client, payload):
    assert client.post("/api/products", json=payload).status_code == 422


def test_update_product(client, make_product, make_supplier):
    product = make_product()
    supplier = make_supplier(name="Boxwell")
    response = client.patch(
        f"/api/products/{product['id']}",
        json={"name": "Renamed", "reorder_level": 20, "supplier_id": supplier["id"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed"
    assert body["supplier"] == {"id": supplier["id"], "name": "Boxwell"}
    assert body["sku"] == product["sku"]

    assert client.patch(f"/api/products/{product['id']}", json={"name": None}).status_code == 422


def test_delete_product_removes_its_history(client, make_product, move):
    product = make_product(initial_stock=5)
    assert client.delete(f"/api/products/{product['id']}").status_code == 204
    assert client.get(f"/api/products/{product['id']}").status_code == 404
    assert client.get("/api/movements").json()["total"] == 0


def test_filters_and_search(client, make_product, make_supplier):
    supplier = make_supplier()
    make_product(sku="CAB-1", name="HDMI cable", category="Electronics", initial_stock=50)
    make_product(sku="CAB-2", name="USB cable", category="Electronics", supplier_id=supplier["id"])
    make_product(sku="GLV-1", name="Work gloves", category="Safety", initial_stock=3)

    def skus(**params):
        items = client.get("/api/products", params=params).json()["items"]
        return [p["sku"] for p in items]

    assert skus(search="cable") == ["CAB-1", "CAB-2"]
    assert skus(search="glv") == ["GLV-1"]
    assert skus(category="Safety") == ["GLV-1"]
    assert skus(supplier_id=supplier["id"]) == ["CAB-2"]
    assert skus(stock_status="out") == ["CAB-2"]
    assert skus(stock_status="low") == ["GLV-1"]
    assert skus(stock_status="in_stock") == ["CAB-1"]
    assert client.get("/api/products", params={"stock_status": "nope"}).status_code == 422
    assert client.get("/api/products/categories").json() == ["Electronics", "Safety"]


def test_sorting_and_paging(client, make_product):
    make_product(sku="A-1", name="b item", initial_stock=7, cost_price=1)
    make_product(sku="A-2", name="A item", initial_stock=2, cost_price=10)
    make_product(sku="A-3", name="c item", initial_stock=30, cost_price=0.5)

    def skus(sort):
        items = client.get("/api/products", params={"sort": sort}).json()["items"]
        return [p["sku"] for p in items]

    assert skus("name") == ["A-2", "A-1", "A-3"]  # case-insensitive
    assert skus("-stock") == ["A-3", "A-1", "A-2"]
    assert skus("-stock_value") == ["A-2", "A-3", "A-1"]
    assert client.get("/api/products", params={"sort": "price"}).status_code == 422

    page = client.get("/api/products", params={"page": 2, "page_size": 2, "sort": "sku"}).json()
    assert page["total"] == 3
    assert [p["sku"] for p in page["items"]] == ["A-3"]
    assert client.get("/api/products", params={"page_size": 500}).status_code == 422


def test_seeded_catalogue(seeded_client):
    products = seeded_client.get("/api/products", params={"page_size": 200}).json()
    assert products["total"] == 40
    assert all(p["stock"] >= 0 for p in products["items"])
    assert seeded_client.get("/api/suppliers").json()["total"] == 8
    assert seeded_client.get("/api/movements").json()["total"] == 209
