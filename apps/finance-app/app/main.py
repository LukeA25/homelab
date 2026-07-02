"""Finance projection app.

A small single-user budgeting app on top of Plaid. Plaid is only ever called
on demand (link/exchange and POST /refresh) because it bills per call; every
page load reads cached data from SQLite for free.
"""

import os
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select

from plaid.exceptions import ApiException

from . import budget, plaid_client
from .db import get_session, init_db
from .models import (
    Account,
    Category,
    Holding,
    InvestmentTransaction,
    Item,
    MappingRule,
    Projection,
    Security,
    Subcategory,
    Transaction,
)
from .seed import seed_if_empty

app = FastAPI()

# All JSON endpoints live under /api so they don't collide with the SPA's
# client-side routes (e.g. /transactions is a page in the React app).
api = APIRouter()


@app.on_event("startup")
def on_startup():
    init_db()
    with get_session() as session:
        seed_if_empty(session)


def get_db():
    with get_session() as session:
        yield session


def active_item(session: Session) -> Optional[Item]:
    return session.exec(select(Item).order_by(Item.id.desc())).first()


def require_token(session: Session) -> str:
    item = active_item(session)
    if not item:
        raise HTTPException(status_code=400, detail="No bank connected yet")
    return item.access_token


def is_investment_type(type_str: Optional[str]) -> bool:
    return (type_str or "").lower() == "investment"


def _upsert_securities(session: Session, securities: list[dict]) -> None:
    for s in securities:
        sid = s.get("security_id")
        if not sid:
            continue
        sec = session.get(Security, sid)
        if not sec:
            sec = Security(id=sid)
        sec.ticker = s.get("ticker_symbol")
        sec.name = s.get("name")
        sec.security_type = str(s.get("type")) if s.get("type") is not None else None
        sec.close_price = s.get("close_price")
        sec.iso_currency_code = s.get("iso_currency_code")
        session.add(sec)
    session.commit()


def _sync_investments(
    session: Session,
    item: Item,
    access_token: str,
    start_date: date,
    end_date: date,
) -> None:
    """Pull holdings + investment transactions. No-op if Item lacks investments."""
    try:
        data = plaid_client.get_investments_holdings(access_token)
    except ApiException:
        return

    accounts = data.get("accounts", [])
    if accounts:
        _upsert_accounts(session, item, accounts)

    securities = data.get("securities", [])
    if securities:
        _upsert_securities(session, securities)

    account_ids = [a["account_id"] for a in accounts if a.get("account_id")]
    for acct_id in account_ids:
        for h in session.exec(
            select(Holding).where(Holding.account_id == acct_id)
        ).all():
            session.delete(h)
    session.commit()

    now = datetime.now(timezone.utc).isoformat()
    for h in data.get("holdings", []):
        session.add(Holding(
            account_id=h["account_id"],
            security_id=h["security_id"],
            quantity=h.get("quantity") or 0.0,
            institution_price=h.get("institution_price"),
            institution_value=h.get("institution_value"),
            cost_basis=h.get("cost_basis"),
            iso_currency_code=h.get("iso_currency_code"),
            updated_at=now,
        ))
    session.commit()

    try:
        inv_txns, txn_securities = plaid_client.get_investment_transactions(
            access_token, start_date, end_date
        )
    except ApiException:
        return

    if txn_securities:
        _upsert_securities(session, txn_securities)
    _upsert_investment_transactions(session, inv_txns)


def _upsert_investment_transactions(session: Session, txns: list[dict]) -> None:
    for t in txns:
        txn_id = t["investment_transaction_id"]
        existing = session.get(InvestmentTransaction, txn_id)
        if existing:
            existing.account_id = t.get("account_id")
            existing.security_id = t.get("security_id")
            existing.date = str(t.get("date"))
            existing.name = t.get("name")
            existing.amount = t.get("amount") or 0.0
            existing.quantity = t.get("quantity")
            existing.price = t.get("price")
            existing.txn_type = str(t.get("type")) if t.get("type") is not None else None
            existing.subtype = str(t.get("subtype")) if t.get("subtype") is not None else None
            existing.fees = t.get("fees")
            session.add(existing)
        else:
            session.add(InvestmentTransaction(
                id=txn_id,
                account_id=t.get("account_id"),
                security_id=t.get("security_id"),
                date=str(t.get("date")),
                name=t.get("name"),
                amount=t.get("amount") or 0.0,
                quantity=t.get("quantity"),
                price=t.get("price"),
                txn_type=str(t.get("type")) if t.get("type") is not None else None,
                subtype=str(t.get("subtype")) if t.get("subtype") is not None else None,
                fees=t.get("fees"),
            ))
    session.commit()


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class PublicTokenRequest(BaseModel):
    public_token: str


class CategoryIn(BaseModel):
    name: str
    kind: str
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    sort_order: Optional[int] = None


class SubcategoryIn(BaseModel):
    category_id: int
    name: str
    sort_order: int = 0


class SubcategoryUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    sort_order: Optional[int] = None


class ProjectionItem(BaseModel):
    subcategory_id: int
    month: str
    amount: float


class ProjectionsIn(BaseModel):
    projections: list[ProjectionItem]


class AssignIn(BaseModel):
    subcategory_id: Optional[int] = None


class ManualTxnIn(BaseModel):
    date: str
    name: str
    amount: float  # positive = spending, negative = income (Plaid convention)
    merchant_name: Optional[str] = None
    subcategory_id: Optional[int] = None


class RuleIn(BaseModel):
    match_type: str
    match_value: str
    subcategory_id: int
    priority: int = 0


class RuleUpdate(BaseModel):
    match_type: Optional[str] = None
    match_value: Optional[str] = None
    subcategory_id: Optional[int] = None
    priority: Optional[int] = None


class SettingsIn(BaseModel):
    budget_year_start_month: int


# ---------------------------------------------------------------------------
# Plaid link / exchange / refresh
# ---------------------------------------------------------------------------

@api.post("/create_link_token")
def create_link_token(mode: str = Query(default="all")):
    if mode not in ("all", "bank", "investments"):
        raise HTTPException(status_code=400, detail="Invalid mode")
    try:
        return plaid_client.create_link_token(mode)
    except ApiException as e:
        raise HTTPException(status_code=500, detail=str(e))


@api.post("/exchange_public_token")
def exchange_public_token(body: PublicTokenRequest, session: Session = Depends(get_db)):
    try:
        resp = plaid_client.exchange_public_token(body.public_token)
    except ApiException as e:
        raise HTTPException(status_code=500, detail=str(e))

    item = Item(
        access_token=resp["access_token"],
        item_id=resp["item_id"],
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(item)
    session.commit()
    return {"item_id": resp["item_id"], "message": "public_token exchanged successfully"}


def _upsert_accounts(session: Session, item: Item, accounts: list[dict]):
    now = datetime.now(timezone.utc).isoformat()
    for a in accounts:
        bal = a.get("balances") or {}
        acct = session.get(Account, a["account_id"])
        if not acct:
            acct = Account(id=a["account_id"])
        acct.item_db_id = item.id
        acct.name = a.get("name")
        acct.official_name = a.get("official_name")
        acct.mask = a.get("mask")
        acct.type = str(a.get("type")) if a.get("type") is not None else None
        acct.subtype = str(a.get("subtype")) if a.get("subtype") is not None else None
        acct.current_balance = bal.get("current")
        acct.available_balance = bal.get("available")
        acct.updated_at = now
        session.add(acct)
    session.commit()


def _upsert_transactions(session: Session, txns: list[dict]):
    for t in txns:
        pfc = t.get("personal_finance_category") or {}
        txn_id = t["transaction_id"]

        # When a pending charge posts, Plaid issues a brand-new transaction with
        # a new id and points back to the original via pending_transaction_id.
        # Collapse that lifecycle into one row: drop the stale pending row (so it
        # isn't double-counted) and carry over any manual override the user set.
        carried_override = None
        pending_pred_id = t.get("pending_transaction_id")
        if pending_pred_id and pending_pred_id != txn_id:
            pred = session.get(Transaction, pending_pred_id)
            if pred is not None:
                carried_override = pred.override_subcategory_id
                session.delete(pred)

        existing = session.get(Transaction, txn_id)
        if existing:
            # Preserve the user's manual override; refresh everything else.
            existing.account_id = t.get("account_id")
            existing.date = str(t.get("date"))
            existing.name = t.get("name")
            existing.merchant_name = t.get("merchant_name")
            existing.amount = t.get("amount") or 0.0
            existing.pfc_primary = pfc.get("primary")
            existing.pfc_detailed = pfc.get("detailed")
            existing.pending = bool(t.get("pending"))
            if existing.override_subcategory_id is None and carried_override is not None:
                existing.override_subcategory_id = carried_override
            session.add(existing)
        else:
            session.add(Transaction(
                id=txn_id,
                account_id=t.get("account_id"),
                date=str(t.get("date")),
                name=t.get("name"),
                merchant_name=t.get("merchant_name"),
                amount=t.get("amount") or 0.0,
                pfc_primary=pfc.get("primary"),
                pfc_detailed=pfc.get("detailed"),
                pending=bool(t.get("pending")),
                source="plaid",
                override_subcategory_id=carried_override,
            ))
    session.commit()


@api.post("/refresh")
def refresh(session: Session = Depends(get_db)):
    """Pull the full budget year from Plaid and upsert into SQLite."""
    item = active_item(session)
    if not item:
        raise HTTPException(status_code=400, detail="No bank connected yet")

    start_month = budget.get_start_month(session)
    months = budget.budget_months(start_month)
    start_date = date(int(months[0][:4]), int(months[0][5:7]), 1)
    end_date = date.today()

    try:
        accounts = plaid_client.get_balances(item.access_token)
        txns = plaid_client.get_transactions(item.access_token, start_date, end_date)
    except ApiException as e:
        raise HTTPException(status_code=500, detail=str(e))

    _upsert_accounts(session, item, accounts)
    _upsert_transactions(session, txns)
    _sync_investments(session, item, item.access_token, start_date, end_date)
    budget.set_meta(session, "last_refreshed", datetime.now(timezone.utc).isoformat())

    return snapshot(session)


# ---------------------------------------------------------------------------
# Snapshot (cached, no Plaid)
# ---------------------------------------------------------------------------

@api.get("/data")
def data(session: Session = Depends(get_db)):
    return snapshot(session)


@api.delete("/accounts/{account_id}")
def delete_account(account_id: str, session: Session = Depends(get_db)):
    """Remove an account, delete all its transactions, and disconnect the
    Plaid Item if it has no remaining accounts."""
    acct = session.get(Account, account_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")

    for t in session.exec(
        select(Transaction).where(Transaction.account_id == account_id)
    ).all():
        session.delete(t)

    for h in session.exec(
        select(Holding).where(Holding.account_id == account_id)
    ).all():
        session.delete(h)

    for t in session.exec(
        select(InvestmentTransaction).where(
            InvestmentTransaction.account_id == account_id
        )
    ).all():
        session.delete(t)

    item_db_id = acct.item_db_id
    session.delete(acct)
    session.commit()

    # If this was the last account for its Plaid Item, remove the Item too.
    if item_db_id is not None:
        remaining = session.exec(
            select(Account).where(Account.item_db_id == item_db_id)
        ).first()
        if remaining is None:
            item = session.get(Item, item_db_id)
            if item:
                try:
                    plaid_client.remove_item(item.access_token)
                except Exception:
                    # Stale/sandbox token may already be invalid; remove locally anyway.
                    pass
                session.delete(item)
                session.commit()

    return {"ok": True}


def snapshot(session: Session) -> dict:
    accounts = session.exec(select(Account)).all()
    item = active_item(session)
    return {
        "connected": item is not None,
        "last_refreshed": budget.get_meta(session, "last_refreshed"),
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "official_name": a.official_name,
                "mask": a.mask,
                "type": a.type,
                "subtype": a.subtype,
                "current_balance": a.current_balance,
                "available_balance": a.available_balance,
            }
            for a in accounts
        ],
    }


@api.get("/investments")
def investments_data(session: Session = Depends(get_db)):
    """Cached portfolio overview — no Plaid calls."""
    accounts = [
        a for a in session.exec(select(Account)).all()
        if is_investment_type(a.type)
    ]
    account_ids = {a.id for a in accounts}
    account_index = {a.id: a for a in accounts}

    holdings = session.exec(select(Holding)).all()
    holdings = [h for h in holdings if h.account_id in account_ids]

    sec_ids = {h.security_id for h in holdings}
    securities = {
        s.id: s
        for s in session.exec(select(Security)).all()
        if s.id in sec_ids
    }

    total_value = sum(h.institution_value or 0 for h in holdings)
    total_cost = sum(h.cost_basis or 0 for h in holdings if h.cost_basis)

    holding_rows = []
    by_ticker: dict[str, dict] = {}

    for h in holdings:
        sec = securities.get(h.security_id)
        acct = account_index.get(h.account_id)
        val = h.institution_value or 0
        ticker = sec.ticker if sec and sec.ticker else None
        label = (sec.name if sec and sec.name else None) or ticker or "Unknown"
        group_key = ticker or label

        holding_rows.append({
            "id": h.id,
            "account_id": h.account_id,
            "account_name": acct.official_name or acct.name if acct else None,
            "account_mask": acct.mask if acct else None,
            "security_id": h.security_id,
            "ticker": sec.ticker if sec else None,
            "name": label,
            "security_type": sec.security_type if sec else None,
            "quantity": h.quantity,
            "price": h.institution_price,
            "value": val,
            "cost_basis": h.cost_basis,
            "gain": (val - h.cost_basis) if h.cost_basis is not None else None,
        })

        key = group_key
        if key not in by_ticker:
            by_ticker[key] = {
                "ticker": ticker,
                "name": label,
                "value": 0.0,
                "cost_basis": 0.0,
                "has_cost": False,
            }
        by_ticker[key]["value"] += val
        if h.cost_basis is not None:
            by_ticker[key]["cost_basis"] += h.cost_basis
            by_ticker[key]["has_cost"] = True

    allocation = sorted(
        [
            {
                **v,
                "gain": (v["value"] - v["cost_basis"]) if v["has_cost"] else None,
                "weight": (v["value"] / total_value) if total_value > 0 else 0,
            }
            for v in by_ticker.values()
        ],
        key=lambda x: x["value"],
        reverse=True,
    )

    inv_txns = session.exec(
        select(InvestmentTransaction).order_by(InvestmentTransaction.date.desc())
    ).all()
    inv_txns = [t for t in inv_txns if t.account_id in account_ids][:40]

    activity = []
    for t in inv_txns:
        sec = session.get(Security, t.security_id) if t.security_id else None
        acct = account_index.get(t.account_id)
        activity.append({
            "id": t.id,
            "date": t.date,
            "name": t.name,
            "amount": t.amount,
            "quantity": t.quantity,
            "price": t.price,
            "type": t.txn_type,
            "subtype": t.subtype,
            "ticker": sec.ticker if sec else None,
            "security_name": sec.name if sec else None,
            "account_name": acct.official_name or acct.name if acct else None,
        })

    return {
        "connected": active_item(session) is not None,
        "total_value": total_value,
        "total_cost_basis": total_cost if total_cost > 0 else None,
        "total_gain": (total_value - total_cost) if total_cost > 0 else None,
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "official_name": a.official_name,
                "mask": a.mask,
                "subtype": a.subtype,
                "current_balance": a.current_balance,
                "available_balance": a.available_balance,
            }
            for a in accounts
        ],
        "holdings": sorted(holding_rows, key=lambda r: r["value"] or 0, reverse=True),
        "allocation": allocation,
        "activity": activity,
    }


# ---------------------------------------------------------------------------
# Budget year metadata
# ---------------------------------------------------------------------------

@api.get("/months")
def months(session: Session = Depends(get_db)):
    start_month = budget.get_start_month(session)
    ms = budget.budget_months(start_month)
    return {"months": ms, "labels": [budget.month_label(m) for m in ms]}


@api.get("/settings")
def get_settings(session: Session = Depends(get_db)):
    return {"budget_year_start_month": budget.get_start_month(session)}


@api.put("/settings")
def put_settings(body: SettingsIn, session: Session = Depends(get_db)):
    month = max(1, min(12, body.budget_year_start_month))
    budget.set_meta(session, "budget_year_start_month", str(month))
    return {"budget_year_start_month": month}


# ---------------------------------------------------------------------------
# Categories + subcategories + projections
# ---------------------------------------------------------------------------

@api.get("/categories")
def list_categories(session: Session = Depends(get_db)):
    start_month = budget.get_start_month(session)
    ms = budget.budget_months(start_month)
    month_set = set(ms)

    proj: dict[tuple[int, str], float] = {}
    for p in session.exec(select(Projection)).all():
        if p.month in month_set:
            proj[(p.subcategory_id, p.month)] = p.amount

    cats = session.exec(select(Category).order_by(Category.sort_order)).all()
    subs = session.exec(select(Subcategory).order_by(Subcategory.sort_order)).all()
    subs_by_cat: dict[int, list[Subcategory]] = {}
    for s in subs:
        subs_by_cat.setdefault(s.category_id, []).append(s)

    result = []
    for c in cats:
        sub_rows = []
        for s in subs_by_cat.get(c.id, []):
            monthly = {m: proj.get((s.id, m), 0.0) for m in ms}
            sub_rows.append({
                "id": s.id,
                "name": s.name,
                "sort_order": s.sort_order,
                "projections": monthly,
                "annual": round(sum(monthly.values()), 2),
            })
        result.append({
            "id": c.id,
            "name": c.name,
            "kind": c.kind,
            "sort_order": c.sort_order,
            "subcategories": sub_rows,
        })

    return {"months": ms, "labels": [budget.month_label(m) for m in ms], "categories": result}


@api.post("/categories")
def create_category(body: CategoryIn, session: Session = Depends(get_db)):
    if body.kind not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="kind must be income or expense")
    cat = Category(name=body.name, kind=body.kind, sort_order=body.sort_order)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"id": cat.id}


@api.patch("/categories/{category_id}")
def update_category(category_id: int, body: CategoryUpdate, session: Session = Depends(get_db)):
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None:
        cat.name = body.name
    if body.kind is not None:
        if body.kind not in ("income", "expense"):
            raise HTTPException(status_code=400, detail="kind must be income or expense")
        cat.kind = body.kind
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    session.add(cat)
    session.commit()
    return {"ok": True}


@api.delete("/categories/{category_id}")
def delete_category(category_id: int, session: Session = Depends(get_db)):
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    subs = session.exec(
        select(Subcategory).where(Subcategory.category_id == category_id)
    ).all()
    for s in subs:
        _delete_subcategory(session, s)
    session.delete(cat)
    session.commit()
    return {"ok": True}


def _delete_subcategory(session: Session, sub: Subcategory):
    for p in session.exec(
        select(Projection).where(Projection.subcategory_id == sub.id)
    ).all():
        session.delete(p)
    for r in session.exec(
        select(MappingRule).where(MappingRule.subcategory_id == sub.id)
    ).all():
        session.delete(r)
    for t in session.exec(
        select(Transaction).where(Transaction.override_subcategory_id == sub.id)
    ).all():
        t.override_subcategory_id = None
        session.add(t)
    session.delete(sub)


@api.post("/subcategories")
def create_subcategory(body: SubcategoryIn, session: Session = Depends(get_db)):
    if not session.get(Category, body.category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    sub = Subcategory(category_id=body.category_id, name=body.name, sort_order=body.sort_order)
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return {"id": sub.id}


@api.patch("/subcategories/{subcategory_id}")
def update_subcategory(subcategory_id: int, body: SubcategoryUpdate, session: Session = Depends(get_db)):
    sub = session.get(Subcategory, subcategory_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    if body.name is not None:
        sub.name = body.name
    if body.category_id is not None:
        sub.category_id = body.category_id
    if body.sort_order is not None:
        sub.sort_order = body.sort_order
    session.add(sub)
    session.commit()
    return {"ok": True}


@api.delete("/subcategories/{subcategory_id}")
def delete_subcategory(subcategory_id: int, session: Session = Depends(get_db)):
    sub = session.get(Subcategory, subcategory_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    _delete_subcategory(session, sub)
    session.commit()
    return {"ok": True}


@api.put("/projections")
def put_projections(body: ProjectionsIn, session: Session = Depends(get_db)):
    for item in body.projections:
        existing = session.exec(
            select(Projection).where(
                Projection.subcategory_id == item.subcategory_id,
                Projection.month == item.month,
            )
        ).first()
        if existing:
            existing.amount = item.amount
            session.add(existing)
        else:
            session.add(Projection(
                subcategory_id=item.subcategory_id,
                month=item.month,
                amount=item.amount,
            ))
    session.commit()
    return {"ok": True, "count": len(body.projections)}


# ---------------------------------------------------------------------------
# Budget compute
# ---------------------------------------------------------------------------

@api.get("/budget")
def get_budget(view: str = "overview", session: Session = Depends(get_db)):
    start_month = budget.get_start_month(session)
    ms = budget.budget_months(start_month)
    if view == "monthly":
        return budget.compute_monthly(session, ms)
    return budget.compute_overview(session, ms)


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def _subcategory_index(session: Session):
    cats = {c.id: c for c in session.exec(select(Category)).all()}
    index = {}
    for s in session.exec(select(Subcategory)).all():
        cat = cats.get(s.category_id)
        index[s.id] = {
            "name": s.name,
            "category_id": s.category_id,
            "category_name": cat.name if cat else None,
            "kind": cat.kind if cat else None,
        }
    return index


@api.get("/transactions")
def list_transactions(month: Optional[str] = None, session: Session = Depends(get_db)):
    resolver = budget.load_resolver(session)
    sub_index = _subcategory_index(session)

    query = select(Transaction).order_by(Transaction.date.desc())
    rows = []
    for t in session.exec(query).all():
        if month and not (t.date or "").startswith(month):
            continue
        resolved = resolver.resolve(t)
        info = sub_index.get(resolved) if resolved is not None else None
        rows.append({
            "id": t.id,
            "date": t.date,
            "name": t.name,
            "merchant_name": t.merchant_name,
            "amount": t.amount,
            "pfc_primary": t.pfc_primary,
            "pfc_detailed": t.pfc_detailed,
            "pending": t.pending,
            "source": t.source,
            "resolved_subcategory_id": resolved,
            "resolved_name": info["name"] if info else None,
            "resolved_category_name": info["category_name"] if info else None,
            "is_override": t.override_subcategory_id is not None,
        })
    return {"transactions": rows}


@api.put("/transactions/{transaction_id}/assign")
def assign_transaction(transaction_id: str, body: AssignIn, session: Session = Depends(get_db)):
    txn = session.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if body.subcategory_id is not None and not session.get(Subcategory, body.subcategory_id):
        raise HTTPException(status_code=404, detail="Subcategory not found")
    txn.override_subcategory_id = body.subcategory_id
    session.add(txn)
    session.commit()
    return {"ok": True}


@api.post("/transactions")
def create_manual_transaction(body: ManualTxnIn, session: Session = Depends(get_db)):
    txn = Transaction(
        id=f"manual:{uuid.uuid4()}",
        account_id=None,
        date=body.date,
        name=body.name,
        merchant_name=body.merchant_name,
        amount=body.amount,
        source="manual",
        override_subcategory_id=body.subcategory_id,
    )
    session.add(txn)
    session.commit()
    return {"id": txn.id}


@api.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: str, session: Session = Depends(get_db)):
    txn = session.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.source != "manual":
        raise HTTPException(status_code=400, detail="Only manual transactions can be deleted")
    session.delete(txn)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Mapping rules
# ---------------------------------------------------------------------------

@api.get("/rules")
def list_rules(session: Session = Depends(get_db)):
    sub_index = _subcategory_index(session)
    rules = session.exec(select(MappingRule).order_by(MappingRule.priority)).all()
    return {
        "rules": [
            {
                "id": r.id,
                "match_type": r.match_type,
                "match_value": r.match_value,
                "subcategory_id": r.subcategory_id,
                "subcategory_name": (sub_index.get(r.subcategory_id) or {}).get("name"),
                "category_name": (sub_index.get(r.subcategory_id) or {}).get("category_name"),
                "priority": r.priority,
            }
            for r in rules
        ]
    }


@api.post("/rules")
def create_rule(body: RuleIn, session: Session = Depends(get_db)):
    if body.match_type not in ("pfc_primary", "pfc_detailed", "name_contains"):
        raise HTTPException(status_code=400, detail="Invalid match_type")
    if not session.get(Subcategory, body.subcategory_id):
        raise HTTPException(status_code=404, detail="Subcategory not found")
    rule = MappingRule(
        match_type=body.match_type,
        match_value=body.match_value,
        subcategory_id=body.subcategory_id,
        priority=body.priority,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return {"id": rule.id}


@api.patch("/rules/{rule_id}")
def update_rule(rule_id: int, body: RuleUpdate, session: Session = Depends(get_db)):
    rule = session.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if body.match_type is not None:
        rule.match_type = body.match_type
    if body.match_value is not None:
        rule.match_value = body.match_value
    if body.subcategory_id is not None:
        rule.subcategory_id = body.subcategory_id
    if body.priority is not None:
        rule.priority = body.priority
    session.add(rule)
    session.commit()
    return {"ok": True}


@api.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_db)):
    rule = session.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    session.delete(rule)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Wire up the API and serve the built React SPA
# ---------------------------------------------------------------------------

app.include_router(api, prefix="/api")

# The Vite build is copied here by the Docker image (see Dockerfile). __file__
# is /app/app/main.py, so the dist lives at /app/frontend_dist.
_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend_dist")
_ASSETS = os.path.join(_DIST, "assets")

if os.path.isdir(_ASSETS):
    app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")


@app.get("/{full_path:path}")
def spa(full_path: str):
    """Serve the SPA shell for all non-API routes so client-side routing and
    deep links work. Registered last, so /api and /assets take precedence."""
    index = os.path.join(_DIST, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    raise HTTPException(
        status_code=404,
        detail="Frontend build not found. Run the Vite build (see Dockerfile).",
    )
