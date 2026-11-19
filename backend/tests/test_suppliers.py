def test_supplier_crud(client, make_supplier):
    supplier = make_supplier(
        name="Brightpaper Co.", email="sales@brightpaper.example", lead_time_days=3
    )
    assert supplier["product_count"] == 0

    updated = client.patch(
        f"/api/suppliers/{supplier['id']}", json={"contact_name": "Oliver", "phone": ""}
    )
    assert updated.status_code == 200
    assert updated.json()["contact_name"] == "Oliver"
    assert updated.json()["phone"] is None

    assert client.delete(f"/api/suppliers/{supplier['id']}").status_code == 204
    assert client.get(f"/api/suppliers/{supplier['id']}").status_code == 404


def test_supplier_validation(client, make_supplier):
    make_supplier(name="Boxwell")
    assert client.post("/api/suppliers", json={"name": "boxwell"}).status_code == 409
    assert client.post("/api/suppliers", json={"name": ""}).status_code == 422
    assert client.post("/api/suppliers", json={"name": "X", "email": "nope"}).status_code == 422
    assert client.post("/api/suppliers", json={"name": "X", "phone": "abc"}).status_code == 422
    assert (
        client.post("/api/suppliers", json={"name": "X", "lead_time_days": -1}).status_code == 422
    )


def test_supplier_stats_and_products(client, make_supplier, make_product):
    supplier = make_supplier()
    make_product(supplier_id=supplier["id"], initial_stock=4, cost_price=2.5)
    make_product(supplier_id=supplier["id"])
    body = client.get(f"/api/suppliers/{supplier['id']}").json()
    assert body["product_count"] == 2
    assert body["stock_value"] == 10


def test_deleting_a_supplier_keeps_its_products(client, make_supplier, make_product):
    supplier = make_supplier()
    product = make_product(supplier_id=supplier["id"])
    client.delete(f"/api/suppliers/{supplier['id']}")
    kept = client.get(f"/api/products/{product['id']}").json()
    assert kept["supplier_id"] is None
    assert kept["supplier"] is None


def test_supplier_search_and_sort(client, make_supplier, make_product):
    a = make_supplier(name="Alpha Tools", city="Leeds")
    make_supplier(name="beta Paper", city="Lyon")
    make_product(supplier_id=a["id"])

    def names(**params):
        return [s["name"] for s in client.get("/api/suppliers", params=params).json()["items"]]

    assert names() == ["Alpha Tools", "beta Paper"]
    assert names(search="lyon") == ["beta Paper"]
    assert names(sort="-products") == ["Alpha Tools", "beta Paper"]
