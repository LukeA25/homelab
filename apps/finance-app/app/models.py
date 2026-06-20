"""SQLModel tables for the finance app.

Money conventions follow Plaid: a positive `amount` is money leaving the
account (spending), a negative `amount` is money coming in (income). Budget
math in budget.py normalizes these into positive projected/actual figures.
"""

from typing import Optional

from sqlmodel import Field, SQLModel


class Item(SQLModel, table=True):
    """A linked Plaid connection. Stores the long-lived access_token."""

    id: Optional[int] = Field(default=None, primary_key=True)
    access_token: str
    item_id: str
    institution_name: Optional[str] = None
    created_at: str


class Account(SQLModel, table=True):
    """Cached account balances from Plaid (refreshed on demand)."""

    id: str = Field(primary_key=True)  # Plaid account_id
    item_db_id: Optional[int] = Field(default=None, foreign_key="item.id")
    name: Optional[str] = None
    official_name: Optional[str] = None
    mask: Optional[str] = None
    type: Optional[str] = None
    subtype: Optional[str] = None
    current_balance: Optional[float] = None
    available_balance: Optional[float] = None
    updated_at: Optional[str] = None


class Category(SQLModel, table=True):
    """Top-level budget bucket. kind is 'income' or 'expense'."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    kind: str
    sort_order: int = 0


class Subcategory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="category.id")
    name: str
    sort_order: int = 0


class Projection(SQLModel, table=True):
    """A projected amount for one subcategory in one month (YYYY-MM)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    subcategory_id: int = Field(foreign_key="subcategory.id")
    month: str  # 'YYYY-MM'
    amount: float = 0.0


class Transaction(SQLModel, table=True):
    """A Plaid or manual transaction."""

    id: str = Field(primary_key=True)  # Plaid transaction_id, or 'manual:<uuid>'
    account_id: Optional[str] = None
    date: str  # 'YYYY-MM-DD'
    name: Optional[str] = None
    merchant_name: Optional[str] = None
    amount: float = 0.0
    pfc_primary: Optional[str] = None
    pfc_detailed: Optional[str] = None
    pending: bool = False
    source: str = "plaid"  # 'plaid' | 'manual'
    override_subcategory_id: Optional[int] = Field(
        default=None, foreign_key="subcategory.id"
    )


class MappingRule(SQLModel, table=True):
    """Maps a Plaid category (or merchant name fragment) to a subcategory.

    match_type: 'pfc_detailed' | 'pfc_primary' | 'name_contains'
    Higher priority wins; more specific match types are checked first.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    match_type: str
    match_value: str
    subcategory_id: int = Field(foreign_key="subcategory.id")
    priority: int = 0


class Meta(SQLModel, table=True):
    """Simple key/value store for app settings and bookkeeping."""

    key: str = Field(primary_key=True)
    value: Optional[str] = None
