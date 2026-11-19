from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from ..database import Base, get_db

DbSession = Annotated[Session, Depends(get_db)]


@dataclass
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 20,
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


Paging = Annotated[PageParams, Depends(page_params)]


def count_rows(db: Session, stmt: Select) -> int:
    return db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0


def apply_sort(stmt: Select, sort: str | None, columns: dict[str, Any], default: str) -> Select:
    """Sort by a whitelisted key, `-key` means descending."""
    key = sort or default
    descending = key.startswith("-")
    column = columns.get(key.lstrip("-"))
    if column is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Unknown sort field '{key.lstrip('-')}'. Use one of: {', '.join(columns)}",
        )
    return stmt.order_by(column.desc() if descending else column.asc())


def get_or_404[ModelT: Base](db: Session, model: type[ModelT], item_id: int) -> ModelT:
    item = db.get(model, item_id)
    if item is None:
        label = model.__name__.lower()
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"The {label} {item_id} was not found")
    return item


def ensure_exists(db: Session, model: type[Base], item_id: int | None, field: str) -> None:
    """Validate a foreign key coming from the client before writing it."""
    if item_id is not None and db.get(model, item_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"{field}: no {model.__name__.lower()} with id {item_id}",
        )


def like(term: str) -> str:
    escaped = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def apply_changes(item: Base, changes: dict[str, Any], required: set[str]) -> None:
    for field, value in changes.items():
        if value is None and field in required:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{field} cannot be empty")
        setattr(item, field, value)
