from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..models import MovementType, Product, StockMovement
from ..schemas import MovementCreate, MovementOut, Page, ProductRef
from .common import DbSession, Paging, apply_sort, count_rows, like

router = APIRouter(prefix="/movements", tags=["stock movements"])

SORT_COLUMNS = {
    "created_at": StockMovement.created_at,
    "quantity": StockMovement.quantity,
}


def movement_out(movement: StockMovement) -> MovementOut:
    return MovementOut(
        id=movement.id,
        product_id=movement.product_id,
        product=ProductRef.model_validate(movement.product),
        type=movement.type,
        quantity=movement.quantity,
        balance_after=movement.balance_after,
        reference=movement.reference,
        note=movement.note,
        created_at=movement.created_at,
    )


def signed_quantity(payload: MovementCreate) -> int:
    if payload.type == MovementType.OUT:
        return -payload.quantity
    return payload.quantity


def record_movement(db: Session, product: Product, payload: MovementCreate) -> StockMovement:
    """Adds a ledger line, refusing anything that would take stock below zero."""
    current = db.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
            StockMovement.product_id == product.id
        )
    )
    change = signed_quantity(payload)
    balance = current + change
    if balance < 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Not enough stock: {product.sku} has {current} {product.unit} on hand, "
            f"so {abs(change)} cannot be removed",
        )
    movement = StockMovement(
        product=product,
        type=payload.type,
        quantity=change,
        balance_after=balance,
        reference=payload.reference,
        note=payload.note,
    )
    db.add(movement)
    db.flush()
    return movement


def day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


@router.get("", response_model=Page[MovementOut])
def list_movements(
    db: DbSession,
    paging: Paging,
    type: MovementType | None = None,
    product_id: int | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: str | None = None,
) -> Page[MovementOut]:
    if date_from and date_to and date_to < date_from:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "date_to must be on or after date_from"
        )
    stmt = (
        select(StockMovement).join(StockMovement.product).options(joinedload(StockMovement.product))
    )
    if type is not None:
        stmt = stmt.where(StockMovement.type == type.value)
    if product_id is not None:
        stmt = stmt.where(StockMovement.product_id == product_id)
    if search and search.strip():
        pattern = like(search)
        stmt = stmt.where(
            or_(
                Product.sku.ilike(pattern, escape="\\"),
                Product.name.ilike(pattern, escape="\\"),
                StockMovement.reference.ilike(pattern, escape="\\"),
                StockMovement.note.ilike(pattern, escape="\\"),
            )
        )
    # dates are whole days in UTC, date_to is inclusive
    if date_from:
        stmt = stmt.where(StockMovement.created_at >= day_start(date_from))
    if date_to:
        stmt = stmt.where(StockMovement.created_at < day_start(date_to + timedelta(days=1)))

    total = count_rows(db, stmt)
    stmt = apply_sort(stmt, sort, SORT_COLUMNS, "-created_at").order_by(StockMovement.id.desc())
    rows = db.scalars(stmt.offset(paging.offset).limit(paging.page_size)).all()
    return Page(
        items=[movement_out(m) for m in rows],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )
