"""Seeds the budget with the user's spreadsheet structure on first run.

Everything seeded here is fully editable later via the UI; this is only the
starting point so the app isn't empty on first launch.
"""

from sqlmodel import Session, select

from .budget import DEFAULT_START_MONTH, get_meta, set_meta
from .models import Category, MappingRule, RepaymentAllocation, Subcategory, Transaction

SEED_CATEGORIES = [
    ("Income", "income", ["Internship", "Job", "Investments", "Misc"]),
    ("Tax", "expense", ["Income Tax"]),
    ("Trips", "expense", ["Spring Break", "Wedding", "Jimmy", "MaryClaire"]),
    ("Car", "expense", ["Down Payment", "Loan Payments", "Maintenance", "Parking Pass", "Gas"]),
    ("Day to Day", "expense", ["Food", "Misc"]),
    ("Charity", "expense", ["Church", "Misc"]),
]

# (plaid_pfc_primary, category_name, subcategory_name)
SEED_RULES = [
    ("FOOD_AND_DRINK", "Day to Day", "Food"),
    ("GENERAL_MERCHANDISE", "Day to Day", "Misc"),
    ("GENERAL_SERVICES", "Day to Day", "Misc"),
    ("ENTERTAINMENT", "Day to Day", "Misc"),
    ("PERSONAL_CARE", "Day to Day", "Misc"),
    ("MEDICAL", "Day to Day", "Misc"),
    ("RENT_AND_UTILITIES", "Day to Day", "Misc"),
    ("TRANSPORTATION", "Car", "Gas"),
    ("LOAN_PAYMENTS", "Car", "Loan Payments"),
    ("TRAVEL", "Trips", "Spring Break"),
    ("GOVERNMENT_AND_NON_PROFIT", "Charity", "Church"),
    ("INCOME", "Income", "Job"),
]

# (category_name, subcategory_name) pairs added to SEED_CATEGORIES after the
# first release; see backfill_subcategories().
BACKFILL_SUBCATEGORIES = [
    ("Income", "Misc"),
]


def seed_if_empty(session: Session) -> None:
    if get_meta(session, "budget_year_start_month") is None:
        set_meta(session, "budget_year_start_month", str(DEFAULT_START_MONTH))

    existing = session.exec(select(Category)).first()
    if existing is not None:
        return

    # Categories + subcategories
    sub_lookup: dict[tuple[str, str], int] = {}
    for c_order, (cat_name, kind, subs) in enumerate(SEED_CATEGORIES):
        category = Category(name=cat_name, kind=kind, sort_order=c_order)
        session.add(category)
        session.commit()
        session.refresh(category)
        for s_order, sub_name in enumerate(subs):
            sub = Subcategory(
                category_id=category.id, name=sub_name, sort_order=s_order
            )
            session.add(sub)
            session.commit()
            session.refresh(sub)
            sub_lookup[(cat_name, sub_name)] = sub.id

    # Default mapping rules
    for priority, (pfc, cat_name, sub_name) in enumerate(SEED_RULES):
        sub_id = sub_lookup.get((cat_name, sub_name))
        if sub_id is None:
            continue
        session.add(MappingRule(
            match_type="pfc_primary",
            match_value=pfc,
            subcategory_id=sub_id,
            priority=priority,
        ))
    session.commit()


def backfill_subcategories(session: Session) -> None:
    """Add subcategories introduced after the initial seed.

    seed_if_empty() only runs on a fresh database, so existing installs would
    never see them. Each one is added at most once (tracked in Meta) so
    deleting it in the UI isn't undone by the next restart.
    """
    for cat_name, sub_name in BACKFILL_SUBCATEGORIES:
        flag = f"backfilled_subcategory:{cat_name}:{sub_name}"
        if get_meta(session, flag):
            continue

        category = session.exec(
            select(Category).where(Category.name == cat_name)
        ).first()
        if category is None:
            continue

        siblings = list(session.exec(
            select(Subcategory).where(Subcategory.category_id == category.id)
        ).all())
        if not any(s.name == sub_name for s in siblings):
            session.add(Subcategory(
                category_id=category.id,
                name=sub_name,
                sort_order=max((s.sort_order for s in siblings), default=-1) + 1,
            ))
            session.commit()

        set_meta(session, flag, "1")


def backfill_repayment_allocations(session: Session) -> None:
    """Convert legacy Transaction.repayment_for_id links into allocations.

    Runs once (tracked in Meta). Existing full-amount links become a single
    allocation per repayment; the deprecated column is left as-is.
    """
    flag = "backfilled_repayment_allocations"
    if get_meta(session, flag):
        return

    existing = {
        (a.repayment_id, a.expense_id)
        for a in session.exec(select(RepaymentAllocation)).all()
    }
    for txn in session.exec(select(Transaction)).all():
        target_id = txn.repayment_for_id
        if not target_id:
            continue
        if (txn.id, target_id) in existing:
            continue
        session.add(RepaymentAllocation(
            repayment_id=txn.id,
            expense_id=target_id,
            amount=abs(txn.amount or 0.0),
        ))
    session.commit()
    set_meta(session, flag, "1")
