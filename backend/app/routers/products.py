from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..database import utcnow
from ..models import (
    MovementType,
    Product,
    StockMovement,
    StockStatus,
    Supplier,
    stock_status,
    stock_status_expr,
)
from ..schemas import (
    MovementCreate,
    MovementOut,
    Page,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)
from .common import (
    DbSession,
    Paging,
    apply_changes,
    apply_sort,
    count_rows,
    ensure_exists,
    get_or_404,
    like,
)
from .movements import movement_out, record_movement

router = APIRouter(prefix="/products", tags=["products"])

SORT_COLUMNS = {
    "sku": Product.sku,
    "name": func.lower(Product.name),
    "category": Product.category,
    "stock": Product.stock,
    "reorder_level": Product.reorder_level,
    "cost_price": Product.cost_price,
    "sale_price": Product.sale_price,
    "stock_value": Product.stock * Product.cost_price,
    "supplier": select(func.lower(Supplier.name))
    .where(Supplier.id == Product.supplier_id)
    .scalar_subquery(),
    "created_at": Product.created_at,
    "updated_at": Product.updated_at,
}


def product_out(product: Product) -> ProductOut:
    fields = {
        name: getattr(product, name) for name in ProductOut.model_fields if hasattr(product, name)
    }
    return ProductOut.model_validate(
        fields
        | {
            "stock_status": stock_status(product.stock, product.reorder_level),
            "stock_value": round(product.stock * product.cost_price, 2),
        }
    )


def ensure_sku_free(db: Session, sku: str, exclude_id: int | None = None) -> None:
    stmt = select(Product.id).where(Product.sku == sku)
    if exclude_id is not None:
        stmt = stmt.where(Product.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A product with SKU {sku} already exists")


def load_product(db: Session, product_id: int) -> Product:
    product = get_or_404(db, Product, product_id)
    db.refresh(product)  # pick up the latest stock
    return product


@router.get("", response_model=Page[ProductOut])
def list_products(
    db: DbSession,
    paging: Paging,
    search: str | None = None,
    category: str | None = None,
    supplier_id: int | None = None,
    status_filter: Annotated[StockStatus | None, Query(alias="stock_status")] = None,
    sort: str | None = None,
) -> Page[ProductOut]:
    stmt = select(Product).options(joinedload(Product.supplier))
    if search and search.strip():
        pattern = like(search)
        stmt = stmt.where(
            or_(
                Product.sku.ilike(pattern, escape="\\"),
                Product.name.ilike(pattern, escape="\\"),
                Product.category.ilike(pattern, escape="\\"),
            )
        )
    if category:
        stmt = stmt.where(Product.category == category)
    if supplier_id is not None:
        stmt = stmt.where(Product.supplier_id == supplier_id)
    if status_filter is not None:
        stmt = stmt.where(stock_status_expr == status_filter.value)

    total = count_rows(db, stmt)
    stmt = apply_sort(stmt, sort, SORT_COLUMNS, "name").order_by(Product.id)
    products = db.scalars(stmt.offset(paging.offset).limit(paging.page_size)).unique().all()
    return Page(
        items=[product_out(p) for p in products],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/categories", response_model=list[str])
def list_categories(db: DbSession) -> list[str]:
    return list(db.scalars(select(Product.category).distinct().order_by(Product.category)))


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: DbSession) -> ProductOut:
    ensure_exists(db, Supplier, payload.supplier_id, "supplier_id")
    ensure_sku_free(db, payload.sku)
    data = payload.model_dump(exclude={"initial_stock"})
    product = Product(**data)
    db.add(product)
    db.flush()
    if payload.initial_stock:
        record_movement(
            db,
            product,
            MovementCreate(
                type=MovementType.IN, quantity=payload.initial_stock, note="Opening stock"
            ),
        )
    db.commit()
    return product_out(load_product(db, product.id))


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: DbSession) -> ProductOut:
    return product_out(load_product(db, product_id))


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: DbSession) -> ProductOut:
    product = get_or_404(db, Product, product_id)
    changes = payload.model_dump(exclude_unset=True)
    ensure_exists(db, Supplier, changes.get("supplier_id"), "supplier_id")
    if changes.get("sku"):
        ensure_sku_free(db, changes["sku"], product_id)
    apply_changes(
        product,
        changes,
        {"sku", "name", "category", "unit", "cost_price", "sale_price", "reorder_level"},
    )
    product.updated_at = utcnow()
    db.commit()
    return product_out(load_product(db, product_id))


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: DbSession) -> Response:
    product = get_or_404(db, Product, product_id)
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{product_id}/movements", response_model=Page[MovementOut])
def product_movements(product_id: int, db: DbSession, paging: Paging) -> Page[MovementOut]:
    get_or_404(db, Product, product_id)
    stmt = (
        select(StockMovement)
        .options(joinedload(StockMovement.product))
        .where(StockMovement.product_id == product_id)
    )
    total = count_rows(db, stmt)
    stmt = stmt.order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
    rows = db.scalars(stmt.offset(paging.offset).limit(paging.page_size)).all()
    return Page(
        items=[movement_out(m) for m in rows],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.post(
    "/{product_id}/movements",
    response_model=MovementOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "The movement would make the stock negative"}},
)
def create_movement(product_id: int, payload: MovementCreate, db: DbSession) -> MovementOut:
    product = load_product(db, product_id)
    movement = record_movement(db, product, payload)
    db.commit()
    db.refresh(movement)
    return movement_out(movement)
