"""Finance projection app.

A small single-user budgeting app on top of Plaid. Plaid is only ever called
on demand (link/exchange and POST /refresh) because it bills per call; every
page load reads cached data from SQLite for free.
"""

import os
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlmodel import Session, select

from plaid.exceptions import ApiException

from . import budget, plaid_client
from .db import get_session, init_db
from .models import (
    Account,
    Category,
    Item,
    MappingRule,
    Projection,
    Subcategory,
    Transaction,
)
from .seed import seed_if_empty

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


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
# Pages
# ---------------------------------------------------------------------------

def _static_version() -> str:
    """Cache-busting token: newest mtime of the static assets.

    Changes whenever app.js/styles.css change (including on a rebuild, since the
    files are re-copied), so browsers always fetch the latest instead of a
    stale cached copy.
    """
    paths = ["app/static/app.js", "app/static/styles.css"]
    latest = 0.0
    for p in paths:
        try:
            latest = max(latest, os.path.getmtime(p))
        except OSError:
            pass
    return str(int(latest))


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"v": _static_version()},
    )


# ---------------------------------------------------------------------------
# Plaid link / exchange / refresh
# ---------------------------------------------------------------------------

@app.post("/create_link_token")
def create_link_token():
    try:
        return plaid_client.create_link_token()
    except ApiException as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/exchange_public_token")
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
        existing = session.get(Transaction, t["transaction_id"])
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
            session.add(existing)
        else:
            session.add(Transaction(
                id=t["transaction_id"],
                account_id=t.get("account_id"),
                date=str(t.get("date")),
                name=t.get("name"),
                merchant_name=t.get("merchant_name"),
                amount=t.get("amount") or 0.0,
                pfc_primary=pfc.get("primary"),
                pfc_detailed=pfc.get("detailed"),
                pending=bool(t.get("pending")),
                source="plaid",
            ))
    session.commit()


@app.post("/refresh")
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
    budget.set_meta(session, "last_refreshed", datetime.now(timezone.utc).isoformat())

    return snapshot(session)


# ---------------------------------------------------------------------------
# Snapshot (cached, no Plaid)
# ---------------------------------------------------------------------------

@app.get("/data")
def data(session: Session = Depends(get_db)):
    return snapshot(session)


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


# ---------------------------------------------------------------------------
# Budget year metadata
# ---------------------------------------------------------------------------

@app.get("/months")
def months(session: Session = Depends(get_db)):
    start_month = budget.get_start_month(session)
    ms = budget.budget_months(start_month)
    return {"months": ms, "labels": [budget.month_label(m) for m in ms]}


@app.get("/settings")
def get_settings(session: Session = Depends(get_db)):
    return {"budget_year_start_month": budget.get_start_month(session)}


@app.put("/settings")
def put_settings(body: SettingsIn, session: Session = Depends(get_db)):
    month = max(1, min(12, body.budget_year_start_month))
    budget.set_meta(session, "budget_year_start_month", str(month))
    return {"budget_year_start_month": month}


# ---------------------------------------------------------------------------
# Categories + subcategories + projections
# ---------------------------------------------------------------------------

@app.get("/categories")
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


@app.post("/categories")
def create_category(body: CategoryIn, session: Session = Depends(get_db)):
    if body.kind not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="kind must be income or expense")
    cat = Category(name=body.name, kind=body.kind, sort_order=body.sort_order)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"id": cat.id}


@app.patch("/categories/{category_id}")
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


@app.delete("/categories/{category_id}")
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


@app.post("/subcategories")
def create_subcategory(body: SubcategoryIn, session: Session = Depends(get_db)):
    if not session.get(Category, body.category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    sub = Subcategory(category_id=body.category_id, name=body.name, sort_order=body.sort_order)
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return {"id": sub.id}


@app.patch("/subcategories/{subcategory_id}")
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


@app.delete("/subcategories/{subcategory_id}")
def delete_subcategory(subcategory_id: int, session: Session = Depends(get_db)):
    sub = session.get(Subcategory, subcategory_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    _delete_subcategory(session, sub)
    session.commit()
    return {"ok": True}


@app.put("/projections")
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

@app.get("/budget")
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


@app.get("/transactions")
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


@app.put("/transactions/{transaction_id}/assign")
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


@app.post("/transactions")
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


@app.delete("/transactions/{transaction_id}")
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

@app.get("/rules")
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


@app.post("/rules")
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


@app.patch("/rules/{rule_id}")
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


@app.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_db)):
    rule = session.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    session.delete(rule)
    session.commit()
    return {"ok": True}
