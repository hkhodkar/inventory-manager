"""Demo data so the app has something to show on first start.

The records live in seed_data.json, which the frontend's in-browser demo reads
too. Movement times are stored as minutes before the latest 16:00 UTC, so the
dashboard always looks current and the history falls in working hours.
"""

import json
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import utcnow
from .models import Product, StockMovement, Supplier

SEED_FILE = Path(__file__).with_name("seed_data.json")


def load_seed() -> dict:
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


def seed_anchor(now: datetime) -> datetime:
    """The most recent 16:00 UTC that is not in the future."""
    anchor = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return anchor if anchor <= now else anchor - timedelta(days=1)


def seed_if_empty(session: Session) -> bool:
    if session.scalar(select(func.count(Product.id))):
        return False

    data = load_seed()
    now = utcnow().replace(second=0, microsecond=0)
    anchor = seed_anchor(now)

    suppliers = []
    for row in data["suppliers"]:
        fields = {k: v for k, v in row.items() if k != "days_ago"}
        suppliers.append(Supplier(**fields, created_at=now - timedelta(days=row["days_ago"])))
    session.add_all(suppliers)

    products = []
    for row in data["products"]:
        fields = {k: v for k, v in row.items() if k not in ("supplier", "days_ago")}
        created = now - timedelta(days=row["days_ago"])
        products.append(
            Product(
                **fields,
                supplier=suppliers[row["supplier"]],
                created_at=created,
                updated_at=created,
            )
        )
    session.add_all(products)

    # movements are listed oldest first, so the running balance can be kept here
    balances = [0] * len(products)
    for row in data["movements"]:
        index = row["product"]
        balances[index] += row["quantity"]
        session.add(
            StockMovement(
                product=products[index],
                type=row["type"],
                quantity=row["quantity"],
                balance_after=balances[index],
                reference=row["reference"],
                note=row["note"],
                created_at=anchor - timedelta(minutes=row["minutes_ago"]),
            )
        )
    session.commit()
    return True
