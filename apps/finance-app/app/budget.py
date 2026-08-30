"""Budget-year math: resolving transactions to subcategories and rolling up
projected vs actual figures for the overview and monthly views.
"""

from datetime import date
from typing import Optional

from sqlmodel import Session, select

from .models import (
    Category,
    MappingRule,
    Meta,
    Projection,
    RepaymentAllocation,
    Subcategory,
    Transaction,
)

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

DEFAULT_START_MONTH = 5  # May


# ---------------------------------------------------------------------------
# Meta helpers
# ---------------------------------------------------------------------------

def get_meta(session: Session, key: str, default: Optional[str] = None) -> Optional[str]:
    row = session.get(Meta, key)
    return row.value if row else default


def set_meta(session: Session, key: str, value: str) -> None:
    row = session.get(Meta, key)
    if row:
        row.value = value
    else:
        row = Meta(key=key, value=value)
    session.add(row)
    session.commit()


def get_start_month(session: Session) -> int:
    raw = get_meta(session, "budget_year_start_month", str(DEFAULT_START_MONTH))
    try:
        return max(1, min(12, int(raw)))
    except (TypeError, ValueError):
        return DEFAULT_START_MONTH


# ---------------------------------------------------------------------------
# Budget-year month helpers
# ---------------------------------------------------------------------------

def current_year_start(start_month: int, today: Optional[date] = None) -> date:
    today = today or date.today()
    year = today.year if today.month >= start_month else today.year - 1
    return date(year, start_month, 1)

def budget_months(start_month: int, today: Optional[date] = None) -> list[str]:
    """The 12 'YYYY-MM' strings of the current budget year."""
    start = current_year_start(start_month, today)
    months = []
    y, m = start.year, start.month
    for _ in range(12):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return months


def month_label(ym: str) -> str:
    year, month = ym.split("-")
    return f"{MONTH_NAMES[int(month) - 1]} {year}"


# ---------------------------------------------------------------------------
# Transaction -> subcategory resolution
# ---------------------------------------------------------------------------

class Resolver:
    """Resolves a transaction to a subcategory id using overrides + rules.

    Lower priority number = higher precedence (the top row of the rules list
    wins). The frontend persists priority as the row order.
    """

    def __init__(self, rules: list[MappingRule]):
        self.detailed: dict[str, int] = {}
        self.primary: dict[str, int] = {}
        self.name_rules: list[tuple[str, int]] = []

        ordered = sorted(rules, key=lambda r: r.priority)

        # For dict lookups, process bottom-up so the top (lowest priority) wins.
        for rule in reversed(ordered):
            if rule.match_type == "pfc_detailed":
                self.detailed[rule.match_value.upper()] = rule.subcategory_id
            elif rule.match_type == "pfc_primary":
                self.primary[rule.match_value.upper()] = rule.subcategory_id

        # For name matching, check top-first and take the first hit.
        for rule in ordered:
            if rule.match_type == "name_contains":
                self.name_rules.append((rule.match_value.lower(), rule.subcategory_id))

    def resolve(self, txn: Transaction) -> Optional[int]:
        if txn.override_subcategory_id is not None:
            return txn.override_subcategory_id
        if txn.pfc_detailed and txn.pfc_detailed.upper() in self.detailed:
            return self.detailed[txn.pfc_detailed.upper()]
        if txn.pfc_primary and txn.pfc_primary.upper() in self.primary:
            return self.primary[txn.pfc_primary.upper()]
        haystack = f"{txn.merchant_name or ''} {txn.name or ''}".lower()
        for needle, subcat_id in self.name_rules:
            if needle and needle in haystack:
                return subcat_id
        return None


def load_resolver(session: Session) -> Resolver:
    return Resolver(list(session.exec(select(MappingRule)).all()))


# ---------------------------------------------------------------------------
# Repayments
# ---------------------------------------------------------------------------

# Amounts are floats, so compare to the nearest half cent.
CENT = 0.005


def repayment_index(
    txns: list[Transaction],
    allocations: list[RepaymentAllocation],
) -> tuple[dict[str, float], dict[str, float]]:
    """Returns (repaid per expense id, allocated per repayment id).

    Allocated dollars shrink the expense and are excluded from the repayment's
    income contribution. A dangling allocation (missing either side) is ignored.
    """
    by_id = {t.id: t for t in txns}
    repaid: dict[str, float] = {}
    allocated: dict[str, float] = {}

    for row in allocations:
        repayment = by_id.get(row.repayment_id)
        expense = by_id.get(row.expense_id)
        if repayment is None or expense is None:
            continue
        if (repayment.amount or 0.0) >= 0 or (expense.amount or 0.0) <= 0:
            continue
        amount = abs(row.amount or 0.0)
        if amount <= 0:
            continue
        repaid[row.expense_id] = repaid.get(row.expense_id, 0.0) + amount
        allocated[row.repayment_id] = allocated.get(row.repayment_id, 0.0) + amount

    return repaid, allocated


def load_allocations(session: Session) -> list[RepaymentAllocation]:
    return list(session.exec(select(RepaymentAllocation)).all())


def effective_amount(
    txn: Transaction,
    repaid: dict[str, float],
    allocated: dict[str, float],
) -> float:
    """A transaction's signed amount after allocations.

    Expenses shrink toward zero as they are repaid. Money-in shrinks toward
    zero as it is allocated (leftover still counts as income).
    """
    amount = txn.amount or 0.0
    if amount > 0:
        offset = repaid.get(txn.id, 0.0)
        return max(0.0, amount - offset) if offset > 0 else amount
    if amount < 0:
        offset = allocated.get(txn.id, 0.0)
        # amount is negative; adding the allocated dollars moves it toward zero.
        return min(0.0, amount + offset) if offset > 0 else amount
    return 0.0


def repayment_status(amount: float, repaid_amount: float) -> str:
    """How much of an expense has been paid back: 'none' | 'partial' | 'full'."""
    if amount <= 0 or repaid_amount <= 0:
        return "none"
    return "full" if repaid_amount >= amount - CENT else "partial"


# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------

def _load_structure(session: Session):
    categories = list(session.exec(select(Category).order_by(Category.sort_order)).all())
    subcats = list(session.exec(select(Subcategory).order_by(Subcategory.sort_order)).all())
    subs_by_cat: dict[int, list[Subcategory]] = {}
    for s in subcats:
        subs_by_cat.setdefault(s.category_id, []).append(s)
    kind_by_sub = {s.id: None for s in subcats}
    cat_kind = {c.id: c.kind for c in categories}
    for s in subcats:
        kind_by_sub[s.id] = cat_kind.get(s.category_id)
    return categories, subs_by_cat, kind_by_sub


def _projected_by_sub(session: Session, months: set[str]) -> dict[int, float]:
    out: dict[int, float] = {}
    for p in session.exec(select(Projection)).all():
        if p.month in months:
            out[p.subcategory_id] = out.get(p.subcategory_id, 0.0) + (p.amount or 0.0)
    return out


def _projected_by_sub_month(session: Session, months: set[str]) -> dict[tuple[int, str], float]:
    out: dict[tuple[int, str], float] = {}
    for p in session.exec(select(Projection)).all():
        if p.month in months:
            key = (p.subcategory_id, p.month)
            out[key] = out.get(key, 0.0) + (p.amount or 0.0)
    return out


def _actuals(session: Session, months: set[str], resolver: Resolver, kind_by_sub: dict):
    """Returns (actual_by_sub, actual_by_sub_month, unassigned)."""
    by_sub: dict[int, float] = {}
    by_sub_month: dict[tuple[int, str], float] = {}
    unassigned = {"income_actual": 0.0, "expense_actual": 0.0, "count": 0}

    txns = list(session.exec(select(Transaction)).all())
    repaid, allocated = repayment_index(txns, load_allocations(session))

    for txn in txns:
        ym = (txn.date or "")[:7]
        if ym not in months:
            continue
        amount = effective_amount(txn, repaid, allocated)
        # Fully allocated repayments contribute nothing; leftovers flow as income.
        if abs(amount) <= CENT:
            continue
        sub_id = resolver.resolve(txn)
        if sub_id is None:
            unassigned["count"] += 1
            if amount < 0:
                unassigned["income_actual"] += -amount
            else:
                unassigned["expense_actual"] += amount
            continue
        kind = kind_by_sub.get(sub_id)
        contribution = (-amount) if kind == "income" else amount
        by_sub[sub_id] = by_sub.get(sub_id, 0.0) + contribution
        key = (sub_id, ym)
        by_sub_month[key] = by_sub_month.get(key, 0.0) + contribution

    return by_sub, by_sub_month, unassigned


def _difference(kind: str, projected: float, actual: float) -> float:
    # Favorable variance: expense under budget is positive; income over plan is positive.
    if kind == "income":
        return actual - projected
    return projected - actual


def compute_overview(session: Session, months: list[str]) -> dict:
    month_set = set(months)
    categories, subs_by_cat, kind_by_sub = _load_structure(session)
    resolver = load_resolver(session)
    projected = _projected_by_sub(session, month_set)
    actual_by_sub, _, unassigned = _actuals(session, month_set, resolver, kind_by_sub)

    sections = {"income": [], "expense": []}
    totals = {
        "income": {"projected": 0.0, "actual": 0.0},
        "expense": {"projected": 0.0, "actual": 0.0},
    }

    for cat in categories:
        rows = []
        cat_proj = cat_act = 0.0
        for sub in subs_by_cat.get(cat.id, []):
            p = projected.get(sub.id, 0.0)
            a = actual_by_sub.get(sub.id, 0.0)
            cat_proj += p
            cat_act += a
            rows.append({
                "id": sub.id,
                "name": sub.name,
                "projected": p,
                "actual": a,
                "difference": _difference(cat.kind, p, a),
            })
        totals[cat.kind]["projected"] += cat_proj
        totals[cat.kind]["actual"] += cat_act
        sections[cat.kind].append({
            "id": cat.id,
            "name": cat.name,
            "kind": cat.kind,
            "projected": cat_proj,
            "actual": cat_act,
            "difference": _difference(cat.kind, cat_proj, cat_act),
            "subcategories": rows,
        })

    inc, exp = totals["income"], totals["expense"]
    net = {
        "projected": inc["projected"] - exp["projected"],
        "actual": inc["actual"] - exp["actual"],
    }
    net["difference"] = net["actual"] - net["projected"]

    return {
        "months": months,
        "income": {
            "categories": sections["income"],
            "projected": inc["projected"],
            "actual": inc["actual"],
            "difference": _difference("income", inc["projected"], inc["actual"]),
        },
        "expense": {
            "categories": sections["expense"],
            "projected": exp["projected"],
            "actual": exp["actual"],
            "difference": _difference("expense", exp["projected"], exp["actual"]),
        },
        "net": net,
        "unassigned": unassigned,
    }


def compute_monthly(session: Session, months: list[str]) -> dict:
    month_set = set(months)
    categories, subs_by_cat, kind_by_sub = _load_structure(session)
    resolver = load_resolver(session)
    proj_sm = _projected_by_sub_month(session, month_set)
    _, actual_sm, _ = _actuals(session, month_set, resolver, kind_by_sub)

    def build(kind: str):
        out = []
        for cat in [c for c in categories if c.kind == kind]:
            rows = []
            for sub in subs_by_cat.get(cat.id, []):
                actual = [round(actual_sm.get((sub.id, m), 0.0), 2) for m in months]
                projected = [round(proj_sm.get((sub.id, m), 0.0), 2) for m in months]
                rows.append({
                    "id": sub.id,
                    "name": sub.name,
                    "actual": actual,
                    "projected": projected,
                    "total_actual": round(sum(actual), 2),
                    "total_projected": round(sum(projected), 2),
                })
            out.append({"id": cat.id, "name": cat.name, "subcategories": rows})
        return out

    return {
        "months": months,
        "month_labels": [month_label(m) for m in months],
        "income": build("income"),
        "expense": build("expense"),
    }
