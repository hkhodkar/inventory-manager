from datetime import UTC, datetime


def test_low_stock_alerts(client, make_product, move):
    empty = make_product(sku="LOW-OUT", reorder_level=5)
    almost = make_product(sku="LOW-1", reorder_level=10, initial_stock=2)
    edge = make_product(sku="LOW-2", reorder_level=10, initial_stock=10)
    make_product(sku="OK-1", reorder_level=10, initial_stock=11)

    alerts = client.get("/api/alerts/low-stock").json()
    assert [a["sku"] for a in alerts] == ["LOW-OUT", "LOW-1", "LOW-2"]
    assert alerts[0]["stock_status"] == "out"
    assert alerts[1]["shortage"] == 8
    assert alerts[1]["suggested_order"] == 18
    assert alerts[2]["shortage"] == 0

    # restocking clears the alert
    move(almost["id"], "in", 20)
    move(empty["id"], "in", 6)
    assert [a["id"] for a in client.get("/api/alerts/low-stock").json()] == [edge["id"]]


def test_dashboard(client, make_product, make_supplier, move):
    make_supplier()
    a = make_product(category="Tools", initial_stock=10, cost_price=2, sale_price=5)
    make_product(category="Safety", reorder_level=3)
    move(a["id"], "out", 4)

    stats = client.get("/api/reports/dashboard").json()
    assert stats["product_count"] == 2
    assert stats["supplier_count"] == 1
    assert stats["category_count"] == 2
    assert stats["total_units"] == 6
    assert stats["stock_value"] == 12
    assert stats["retail_value"] == 30
    assert stats["out_of_stock_count"] == 1
    assert stats["low_stock_count"] == 0
    assert stats["units_in_30d"] == 10
    assert stats["units_out_30d"] == 4
    assert stats["movements_30d"] == 2
    assert [m["quantity"] for m in stats["recent_movements"]] == [-4, 10]


def test_stock_value_by_category(client, make_product):
    make_product(category="Tools", initial_stock=10, cost_price=3, sale_price=6)
    make_product(category="Tools", initial_stock=1, cost_price=1, sale_price=2)
    make_product(category="Safety", initial_stock=50, cost_price=1, sale_price=2)
    rows = client.get("/api/reports/stock-by-category").json()
    assert rows == [
        {
            "category": "Safety",
            "product_count": 1,
            "units": 50,
            "stock_value": 50,
            "retail_value": 100,
        },
        {
            "category": "Tools",
            "product_count": 2,
            "units": 11,
            "stock_value": 31,
            "retail_value": 62,
        },
    ]


def test_top_movers(client, make_product, move):
    a = make_product(name="Tape", initial_stock=100)
    b = make_product(name="Boxes", initial_stock=100)
    make_product(name="Idle", initial_stock=100)
    move(a["id"], "out", 10)
    move(b["id"], "out", 30)
    move(b["id"], "out", 5)

    movers = client.get("/api/reports/top-movers", params={"limit": 5}).json()
    assert [(m["product"]["name"], m["units_out"]) for m in movers] == [
        ("Boxes", 35),
        ("Tape", 10),
    ]
    assert movers[0]["units_in"] == 100
    assert movers[0]["movement_count"] == 3
    assert client.get("/api/reports/top-movers", params={"days": 0}).status_code == 422


def test_movements_over_time(client, make_product, move):
    product = make_product(initial_stock=20, cost_price=1.5)
    move(product["id"], "out", 5)
    move(product["id"], "adjustment", -1)

    days = client.get("/api/reports/movements-over-time", params={"days": 7}).json()
    assert len(days) == 7
    today = datetime.now(UTC).date().isoformat()
    assert days[-1] == {
        "date": today,
        "units_in": 20,
        "units_out": 5,
        "adjustments": -1,
        "value_in": 30,
        "value_out": 7.5,
    }
    assert all(d["units_in"] == 0 for d in days[:-1])
    assert client.get("/api/reports/movements-over-time", params={"days": 3}).status_code == 422


def test_seeded_reports_are_consistent(seeded_client):
    stats = seeded_client.get("/api/reports/dashboard").json()
    alerts = seeded_client.get("/api/alerts/low-stock").json()
    assert stats["low_stock_count"] + stats["out_of_stock_count"] == len(alerts)
    assert stats["low_stock_count"] >= 5
    assert stats["out_of_stock_count"] >= 2

    categories = seeded_client.get("/api/reports/stock-by-category").json()
    assert round(sum(c["stock_value"] for c in categories), 2) == stats["stock_value"]
    assert sum(c["product_count"] for c in categories) == 40
