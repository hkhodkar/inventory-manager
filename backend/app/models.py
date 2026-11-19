from datetime import datetime
from enum import StrEnum

from sqlalchemy import Float, ForeignKey, Integer, String, Text, case, func, select
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from .database import Base, UTCDateTime, utcnow


class MovementType(StrEnum):
    IN = "in"
    OUT = "out"
    ADJUSTMENT = "adjustment"


class StockStatus(StrEnum):
    IN_STOCK = "in_stock"
    LOW = "low"
    OUT = "out"


UNITS = ("pcs", "pack", "box", "set", "pair", "roll", "kg", "l", "m")


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    contact_name: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    website: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(80))
    country: Mapped[str | None] = mapped_column(String(80))
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    products: Mapped[list["Product"]] = relationship(back_populates="supplier")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60), index=True)
    unit: Mapped[str] = mapped_column(String(10), default="pcs")
    cost_price: Mapped[float] = mapped_column(Float, default=0)
    sale_price: Mapped[float] = mapped_column(Float, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, default=0)
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    supplier: Mapped[Supplier | None] = relationship(back_populates="products")
    movements: Mapped[list["StockMovement"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", passive_deletes=True
    )


class StockMovement(Base):
    """One line in the stock ledger. `quantity` is the signed change in stock."""

    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[MovementType] = mapped_column(String(12))
    quantity: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    reference: Mapped[str | None] = mapped_column(String(60))
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)

    product: Mapped[Product] = relationship(back_populates="movements")


# current stock is never stored, it is always the sum of the ledger
Product.stock = column_property(
    select(func.coalesce(func.sum(StockMovement.quantity), 0))
    .where(StockMovement.product_id == Product.id)
    .correlate_except(StockMovement)
    .scalar_subquery()
)

stock_status_expr = case(
    (Product.stock <= 0, StockStatus.OUT.value),
    (Product.stock <= Product.reorder_level, StockStatus.LOW.value),
    else_=StockStatus.IN_STOCK.value,
)


def stock_status(stock: int, reorder_level: int) -> StockStatus:
    if stock <= 0:
        return StockStatus.OUT
    if stock <= reorder_level:
        return StockStatus.LOW
    return StockStatus.IN_STOCK
