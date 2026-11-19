from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    model_validator,
)

from .models import MovementType, StockStatus


def _blank_to_none(value: object) -> object:
    if isinstance(value, str) and not value.strip():
        return None
    return value


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


def optional_text(max_length: int, pattern: str | None = None):
    """Optional trimmed string where an empty value means null."""
    text = Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=max_length, pattern=pattern)
    ]
    return Annotated[text | None, BeforeValidator(_blank_to_none)]


OptionalText = optional_text(200)
LongText = optional_text(2000)
Phone = optional_text(40, r"^\+?[0-9()\-.\s]{5,}$")
Reference = optional_text(60)
Note = optional_text(300)
Email = Annotated[EmailStr | None, BeforeValidator(_blank_to_none)]
Money = Annotated[float, Field(ge=0, le=1_000_000)]
Unit = Literal["pcs", "pack", "box", "set", "pair", "roll", "kg", "l", "m"]

SKU_PATTERN = r"^[A-Z0-9][A-Z0-9-]{1,31}$"


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


# --- suppliers ---


class SupplierFields(BaseModel):
    contact_name: OptionalText = None
    email: Email = None
    phone: Phone = None
    website: OptionalText = None
    city: OptionalText = None
    country: OptionalText = None
    lead_time_days: Annotated[int, Field(ge=0, le=365)] | None = None
    notes: LongText = None


class SupplierCreate(SupplierFields):
    name: Name


class SupplierUpdate(SupplierFields):
    name: Name | None = None


class SupplierRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contact_name: str | None
    email: str | None
    phone: str | None
    website: str | None
    city: str | None
    country: str | None
    lead_time_days: int | None
    notes: str | None
    created_at: datetime
    product_count: int = 0
    stock_value: float = 0


# --- products ---


def _clean_sku(value: object) -> object:
    return value.strip().upper() if isinstance(value, str) else value


Sku = Annotated[str, BeforeValidator(_clean_sku), StringConstraints(pattern=SKU_PATTERN)]
Category = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class ProductFields(BaseModel):
    cost_price: Money | None = None
    sale_price: Money | None = None
    reorder_level: Annotated[int, Field(ge=0, le=100_000)] | None = None
    supplier_id: int | None = None
    description: LongText = None


class ProductCreate(ProductFields):
    sku: Sku
    name: Name
    category: Category
    unit: Unit = "pcs"
    cost_price: Money = 0
    sale_price: Money = 0
    reorder_level: Annotated[int, Field(ge=0, le=100_000)] = 0
    initial_stock: Annotated[int, Field(ge=0, le=1_000_000)] = 0


class ProductUpdate(ProductFields):
    sku: Sku | None = None
    name: Name | None = None
    category: Category | None = None
    unit: Unit | None = None


class ProductRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    unit: str


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    category: str
    unit: str
    cost_price: float
    sale_price: float
    reorder_level: int
    supplier_id: int | None
    supplier: SupplierRef | None
    description: str | None
    stock: int
    stock_status: StockStatus
    stock_value: float
    created_at: datetime
    updated_at: datetime


class LowStockItem(ProductOut):
    shortage: int
    suggested_order: int


# --- stock movements ---


class MovementCreate(BaseModel):
    type: MovementType
    quantity: Annotated[int, Field(ge=-1_000_000, le=1_000_000)]
    reference: Reference = None
    note: Note = None

    @model_validator(mode="after")
    def _check_quantity(self) -> "MovementCreate":
        if self.type == MovementType.ADJUSTMENT:
            if self.quantity == 0:
                raise ValueError("An adjustment needs a quantity other than 0")
        elif self.quantity <= 0:
            raise ValueError("Quantity must be greater than 0")
        return self


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product: ProductRef
    type: MovementType
    quantity: int
    balance_after: int
    reference: str | None
    note: str | None
    created_at: datetime


# --- reports ---


class CategoryValue(BaseModel):
    category: str
    product_count: int
    units: int
    stock_value: float
    retail_value: float


class TopMover(BaseModel):
    product: ProductRef
    category: str
    units_out: int
    units_in: int
    movement_count: int


class DailyMovement(BaseModel):
    date: date
    units_in: int
    units_out: int
    adjustments: int
    value_in: float
    value_out: float


class DashboardStats(BaseModel):
    product_count: int
    supplier_count: int
    category_count: int
    total_units: int
    stock_value: float
    retail_value: float
    low_stock_count: int
    out_of_stock_count: int
    units_in_30d: int
    units_out_30d: int
    movements_30d: int
    recent_movements: list[MovementOut]
