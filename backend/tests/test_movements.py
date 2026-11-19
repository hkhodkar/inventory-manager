import pytest


def test_in_out_and_adjustment_update_the_stock(client, make_product, move):
    product = make_product()
    pid = product["id"]

    received = move(pid, "in", 20, reference="PO-1")
    assert received.status_code == 201
    assert received.json()["balance_after"] == 20

    shipped = move(pid, "out", 8, reference="SO-7", note="Webshop order")
    assert shipped.status_code == 201
    assert shipped.json()["quantity"] == -8
    assert shipped.json()["balance_after"] == 12

    counted = move(pid, "adjustment", -2, note="Damaged")
    assert counted.json()["balance_after"] == 10
    assert move(pid, "adjustment", 3).json()["balance_after"] == 13

    current = client.get(f"/api/products/{pid}").json()
    assert current["stock"] == 13
    assert current["stock_status"] == "in_stock"


def test_negative_stock_is_rejected(client, make_product, move):
    product = make_product(sku="NEG-1", initial_stock=5)
    response = move(product["id"], "out", 6)
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Not enough stock: NEG-1 has 5 pcs on hand, so 6 cannot be removed"
    )
    # the same rule applies to adjustments
    assert move(product["id"], "adjustment", -6).status_code == 409
    # nothing was written
    assert client.get(f"/api/products/{product['id']}").json()["stock"] == 5
    assert move(product["id"], "out", 5).json()["balance_after"] == 0


@pytest.mark.parametrize(
    ("type", "quantity"),
    [("in", 0), ("in", -4), ("out", 0), ("out", -1), ("adjustment", 0), ("move", 3)],
)
def test_invalid_movements(client, make_product, move, type, quantity):
    product = make_product(initial_stock=10)
    assert move(product["id"], type, quantity).status_code == 422


def test_movement_for_missing_product(move):
    assert move(404, "in", 1).status_code == 404


def test_product_history_is_newest_first(client, make_product, move):
    product = make_product()
    for qty in (5, 6, 7):
        move(product["id"], "in", qty)
    history = client.get(f"/api/products/{product['id']}/movements", params={"page_size": 2})
    body = history.json()
    assert body["total"] == 3
    assert [m["quantity"] for m in body["items"]] == [7, 6]


def test_global_log_filters(client, make_product, move):
    a = make_product(sku="LOG-A", name="Packing tape")
    b = make_product(sku="LOG-B", name="Gloves")
    move(a["id"], "in", 10, reference="PO-100")
    move(a["id"], "out", 4, reference="SO-200")
    move(b["id"], "in", 3, note="Found in back room")

    def refs(**params):
        return [m["reference"] for m in client.get("/api/movements", params=params).json()["items"]]

    assert len(refs()) == 3
    assert refs(type="out") == ["SO-200"]
    assert refs(product_id=a["id"]) == ["SO-200", "PO-100"]
    assert refs(search="tape") == ["SO-200", "PO-100"]
    assert refs(search="back room") == [None]
    assert refs(search="po-100") == ["PO-100"]
    assert refs(sort="quantity") == ["SO-200", None, "PO-100"]


def test_date_filter(seeded_client):
    all_rows = seeded_client.get("/api/movements", params={"page_size": 200}).json()["items"]
    day = all_rows[0]["created_at"][:10]
    same_day = [m for m in all_rows if m["created_at"].startswith(day)]

    response = seeded_client.get(
        "/api/movements", params={"date_from": day, "date_to": day, "page_size": 200}
    )
    assert response.status_code == 200
    assert response.json()["total"] == len(same_day)

    older = seeded_client.get("/api/movements", params={"date_to": "2000-01-01"}).json()
    assert older["total"] == 0

    bad = seeded_client.get(
        "/api/movements", params={"date_from": "2026-05-02", "date_to": "2026-05-01"}
    )
    assert bad.status_code == 422
