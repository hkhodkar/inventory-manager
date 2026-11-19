from collections import defaultdict
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from ..database import utcnow
from ..models import MovementType, Product, StockMovement, StockStatus, Supplier, stock_status
from ..schemas import (
    CategoryValue,
    DailyMovement,
    DashboardStats,
    LowStockItem,
    ProductRef,
    TopMover,
)
from .common import DbSession
from .movements import day_start, movement_out
from .products import product_out

router = APIRouter(tags=["reports"])


def low_stock_items(db: DbSession) -> list[LowStockItem]:
    products = db.scalars(
        select(Product)
        .options(joinedload(Product.supplier))
        .where(Product.stock <= Product.reorder_level)
    ).all()
    items = [
        LowStockItem(
            **product_out(p).model_dump(),
            shortage=max(p.reorder_level - p.stock, 0),
            suggested_order=max(p.reorder_level * 2 - p.stock, 1),
        )
        for p in products
    ]
    # empty shelves first, then the ones closest to running out
    items.sort(
        key=lambda i: (
            i.stock_status != StockStatus.OUT,
            i.stock / max(i.reorder_level, 1),
            i.name.lower(),
            i.id,
        )
    )
    return items


@router.get("/alerts/low-stock", response_model=list[LowStockItem], tags=["alerts"])
def low_stock(db: DbSession) -> list[LowStockItem]:
    """Products at or below their reorder level, including the ones out of stock."""
    return low_stock_items(db)


@router.get("/reports/dashboard", response_model=DashboardStats)
def dashboard(db: DbSession) -> DashboardStats:
    products = db.scalars(select(Product)).all()
    since = utcnow() - timedelta(days=30)
    recent = db.scalars(select(StockMovement).where(StockMovement.created_at >= since)).all()
    latest = db.scalars(
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(8)
    ).all()
    statuses = [stock_status(p.stock, p.reorder_level) for p in products]
    return DashboardStats(
        product_count=len(products),
        supplier_count=db.scalar(select(func.count(Supplier.id))) or 0,
        category_count=len({p.category for p in products}),
        total_units=sum(max(p.stock, 0) for p in products),
        stock_value=round(sum(max(p.stock, 0) * p.cost_price for p in products), 2),
        retail_value=round(sum(max(p.stock, 0) * p.sale_price for p in products), 2),
        low_stock_count=statuses.count(StockStatus.LOW),
        out_of_stock_count=statuses.count(StockStatus.OUT),
        units_in_30d=sum(m.quantity for m in recent if m.type == MovementType.IN),
        units_out_30d=sum(-m.quantity for m in recent if m.type == MovementType.OUT),
        movements_30d=len(recent),
        recent_movements=[movement_out(m) for m in latest],
    )


@router.get("/reports/stock-by-category", response_model=list[CategoryValue])
def stock_by_category(db: DbSession) -> list[CategoryValue]:
    totals: dict[str, dict[str, float]] = defaultdict(
        lambda: {"products": 0, "units": 0, "value": 0.0, "retail": 0.0}
    )
    for p in db.scalars(select(Product)).all():
        row = totals[p.category]
        stock = max(p.stock, 0)
        row["products"] += 1
        row["units"] += stock
        row["value"] += stock * p.cost_price
        row["retail"] += stock * p.sale_price
    result = [
        CategoryValue(
            category=category,
            product_count=int(row["products"]),
            units=int(row["units"]),
            stock_value=round(row["value"], 2),
            retail_value=round(row["retail"], 2),
        )
        for category, row in totals.items()
    ]
    return sorted(result, key=lambda c: (-c.stock_value, c.category))


@router.get("/reports/top-movers", response_model=list[TopMover])
def top_movers(
    db: DbSession,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    limit: Annotated[int, Query(ge=1, le=50)] = 5,
) -> list[TopMover]:
    """Products with the most units going out in the period."""
    since = utcnow() - timedelta(days=days)
    rows = db.scalars(
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .where(StockMovement.created_at >= since)
    ).all()
    stats: dict[int, TopMover] = {}
    for m in rows:
        mover = stats.get(m.product_id)
        if mover is None:
            mover = stats[m.product_id] = TopMover(
                product=ProductRef.model_validate(m.product),
                category=m.product.category,
                units_out=0,
                units_in=0,
                movement_count=0,
            )
        mover.movement_count += 1
        if m.type == MovementType.OUT:
            mover.units_out -= m.quantity
        elif m.type == MovementType.IN:
            mover.units_in += m.quantity
    movers = [m for m in stats.values() if m.units_out > 0]
    movers.sort(key=lambda m: (-m.units_out, -m.movement_count, m.product.name.lower()))
    return movers[:limit]


@router.get("/reports/movements-over-time", response_model=list[DailyMovement])
def movements_over_time(
    db: DbSession,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
) -> list[DailyMovement]:
    """Units (and their value at cost) in and out per day (UTC), today included."""
    today = utcnow().date()
    first = today - timedelta(days=days - 1)
    buckets = {
        first + timedelta(days=offset): DailyMovement(
            date=first + timedelta(days=offset),
            units_in=0,
            units_out=0,
            adjustments=0,
            value_in=0,
            value_out=0,
        )
        for offset in range(days)
    }
    rows = db.scalars(
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .where(StockMovement.created_at >= day_start(first))
    ).all()
    for m in rows:
        bucket = buckets.get(m.created_at.date())
        if bucket is None:
            continue
        if m.type == MovementType.IN:
            bucket.units_in += m.quantity
            bucket.value_in += m.quantity * m.product.cost_price
        elif m.type == MovementType.OUT:
            bucket.units_out -= m.quantity
            bucket.value_out -= m.quantity * m.product.cost_price
        else:
            bucket.adjustments += m.quantity
    for bucket in buckets.values():
        bucket.value_in = round(bucket.value_in, 2)
        bucket.value_out = round(bucket.value_out, 2)
    return list(buckets.values())
