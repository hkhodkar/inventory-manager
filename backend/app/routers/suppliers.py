from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..models import Product, Supplier
from ..schemas import Page, SupplierCreate, SupplierOut, SupplierUpdate
from .common import DbSession, Paging, apply_changes, apply_sort, count_rows, get_or_404, like

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

product_count = (
    select(func.count(Product.id)).where(Product.supplier_id == Supplier.id).scalar_subquery()
)
# value of the stock on hand at cost, products with no stock count as zero
stock_value = (
    select(func.coalesce(func.sum(func.max(Product.stock, 0) * Product.cost_price), 0))
    .where(Product.supplier_id == Supplier.id)
    .scalar_subquery()
)

SORT_COLUMNS = {
    "name": func.lower(Supplier.name),
    "country": Supplier.country,
    "lead_time_days": Supplier.lead_time_days,
    "products": product_count,
    "stock_value": stock_value,
    "created_at": Supplier.created_at,
}


def supplier_out(supplier: Supplier, count: int, value: float) -> SupplierOut:
    out = SupplierOut.model_validate(supplier)
    return out.model_copy(update={"product_count": count, "stock_value": round(value, 2)})


def ensure_name_free(db: Session, name: str, exclude_id: int | None = None) -> None:
    stmt = select(Supplier.id).where(func.lower(Supplier.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(Supplier.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A supplier named {name} already exists")


def load_supplier(db: Session, supplier_id: int) -> SupplierOut:
    supplier = get_or_404(db, Supplier, supplier_id)
    count, value = db.execute(
        select(product_count, stock_value).where(Supplier.id == supplier_id)
    ).one()
    return supplier_out(supplier, count, value)


@router.get("", response_model=Page[SupplierOut])
def list_suppliers(
    db: DbSession,
    paging: Paging,
    search: str | None = None,
    sort: str | None = None,
) -> Page[SupplierOut]:
    stmt = select(Supplier, product_count, stock_value)
    if search and search.strip():
        pattern = like(search)
        stmt = stmt.where(
            or_(
                Supplier.name.ilike(pattern, escape="\\"),
                Supplier.contact_name.ilike(pattern, escape="\\"),
                Supplier.email.ilike(pattern, escape="\\"),
                Supplier.city.ilike(pattern, escape="\\"),
                Supplier.country.ilike(pattern, escape="\\"),
            )
        )
    total = count_rows(db, stmt)
    stmt = apply_sort(stmt, sort, SORT_COLUMNS, "name").order_by(Supplier.id)
    rows = db.execute(stmt.offset(paging.offset).limit(paging.page_size)).all()
    return Page(
        items=[supplier_out(s, count, value) for s, count, value in rows],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.post("", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierCreate, db: DbSession) -> SupplierOut:
    ensure_name_free(db, payload.name)
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    return load_supplier(db, supplier.id)


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: DbSession) -> SupplierOut:
    return load_supplier(db, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, payload: SupplierUpdate, db: DbSession) -> SupplierOut:
    supplier = get_or_404(db, Supplier, supplier_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name"):
        ensure_name_free(db, changes["name"], supplier_id)
    apply_changes(supplier, changes, {"name"})
    db.commit()
    return load_supplier(db, supplier_id)


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(supplier_id: int, db: DbSession) -> Response:
    """Products are kept, they just lose the supplier link."""
    supplier = get_or_404(db, Supplier, supplier_id)
    db.delete(supplier)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
