from __future__ import annotations

from typing import Any, Dict, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Batch, CoachingLog, Course, LineOfBusiness, MCQCategory, Scenario, User

DEFAULT_LOB_CATALOG: list[dict[str, str]] = [
    {
        "name": "Customer Service",
        "description": "Handling general inquiries, order status updates, account changes, and everyday customer concerns.",
    },
    {
        "name": "Technical Support",
        "description": "Troubleshooting hardware, software, connectivity, login, and device-specific issues.",
    },
    {
        "name": "Billing & Payments",
        "description": "Processing payments, explaining charges, resolving billing disputes, and clarifying account balances.",
    },
    {
        "name": "Sales & Lead Generation",
        "description": "Presenting offers to prospects, qualifying leads, and guiding customers toward new purchases.",
    },
    {
        "name": "Retentions",
        "description": "Handling cancellation risks and keeping existing customers through value-building and save offers.",
    },
    {
        "name": "Collections",
        "description": "Contacting customers about overdue balances and negotiating payment commitments or installment plans.",
    },
    {
        "name": "Fraud Detection",
        "description": "Monitoring suspicious banking activity, verifying transactions, and escalating possible fraud cases.",
    },
    {
        "name": "Credit Cards",
        "description": "Supporting card applications, credit limit requests, and lost or stolen card concerns.",
    },
    {
        "name": "Loans/Mortgages",
        "description": "Assisting with loan or mortgage applications, repayment questions, and account servicing.",
    },
    {
        "name": "Claims Processing",
        "description": "Reviewing healthcare insurance claims, validating details, and updating claim status inquiries.",
    },
    {
        "name": "Medical Coding & Billing",
        "description": "Translating medical procedures into billable codes and supporting healthcare billing workflows.",
    },
    {
        "name": "Provider Credentialing",
        "description": "Verifying healthcare provider qualifications, documents, and accreditation requirements.",
    },
    {
        "name": "Activation/Onboarding",
        "description": "Setting up new telecom services, activating devices, and guiding customers through onboarding.",
    },
    {
        "name": "Plan Upgrades",
        "description": "Helping customers move to new telecom plans, add services, or change service tiers.",
    },
    {
        "name": "Reservations",
        "description": "Booking flights, hotels, rental cars, and other travel or hospitality arrangements.",
    },
    {
        "name": "Concierge",
        "description": "Providing premium travel assistance, itinerary help, and destination information around the clock.",
    },
]

LEGACY_LOB_NAME_MAP: dict[str, str] = {
    "Billing": "Billing & Payments",
    "Billing Support": "Billing & Payments",
    "Customer Care": "Customer Service",
    "Customer Support": "Customer Service",
    "Tech Support": "Technical Support",
    "Sales": "Sales & Lead Generation",
}


def list_active_lobs(db: Session) -> list[LineOfBusiness]:
    return (
        db.query(LineOfBusiness)
        .filter(LineOfBusiness.is_active == True)
        .order_by(LineOfBusiness.name.asc())
        .all()
    )


def _count_active_users_by_lob(db: Session) -> dict[str, int]:
    rows = (
        db.query(User.lob, func.count(User.id))
        .filter(User.is_active == True, User.lob.isnot(None))
        .group_by(User.lob)
        .all()
    )
    return {str(name): int(total) for name, total in rows if name}


def _count_model_rows_by_lob(db: Session, model: Any) -> dict[str, int]:
    rows = (
        db.query(model.lob, func.count(model.id))
        .filter(model.lob.isnot(None))
        .group_by(model.lob)
        .all()
    )
    return {str(name): int(total) for name, total in rows if name}


def serialize_lobs(db: Session, lobs: Sequence[LineOfBusiness]) -> list[dict[str, Any]]:
    user_counts = _count_active_users_by_lob(db)
    scenario_counts = _count_model_rows_by_lob(db, Scenario)
    batch_counts = _count_model_rows_by_lob(db, Batch)
    course_counts = _count_model_rows_by_lob(db, Course)

    return [
        {
            "id": lob.id,
            "name": lob.name,
            "description": lob.description,
            "is_active": lob.is_active,
            "created_at": lob.created_at.isoformat() if lob.created_at else None,
            "active_users_count": user_counts.get(lob.name, 0),
            "scenario_count": scenario_counts.get(lob.name, 0),
            "batch_count": batch_counts.get(lob.name, 0),
            "course_count": course_counts.get(lob.name, 0),
        }
        for lob in lobs
    ]


def sync_default_lob_catalog(
    db: Session,
    *,
    deactivate_missing: bool = True,
) -> dict[str, int]:
    expected_names = {item["name"].lower() for item in DEFAULT_LOB_CATALOG}
    created = 0
    updated = 0
    deactivated = 0

    for item in DEFAULT_LOB_CATALOG:
        lob = (
            db.query(LineOfBusiness)
            .filter(func.lower(LineOfBusiness.name) == item["name"].lower())
            .first()
        )

        if lob is None:
            lob = LineOfBusiness(
                name=item["name"],
                description=item["description"],
                is_active=True,
            )
            db.add(lob)
            created += 1
            continue

        changed = False
        if lob.name != item["name"]:
            lob.name = item["name"]
            changed = True
        if (lob.description or "") != item["description"]:
            lob.description = item["description"]
            changed = True
        if not lob.is_active:
            lob.is_active = True
            changed = True
        if changed:
            updated += 1

    if deactivate_missing:
        stale_lobs = (
            db.query(LineOfBusiness)
            .filter(LineOfBusiness.is_active == True)
            .all()
        )
        for lob in stale_lobs:
            if lob.name.lower() not in expected_names:
                lob.is_active = False
                deactivated += 1

    db.flush()
    return {
        "created": created,
        "updated": updated,
        "deactivated": deactivated,
        "total": len(DEFAULT_LOB_CATALOG),
    }


def migrate_legacy_lob_references(db: Session) -> dict[str, int]:
    updated_counts = {
        "users": 0,
        "scenarios": 0,
        "batches": 0,
        "courses": 0,
        "mcq_categories": 0,
        "coaching_logs": 0,
    }

    models = [
        (User, "users"),
        (Scenario, "scenarios"),
        (Batch, "batches"),
        (Course, "courses"),
        (MCQCategory, "mcq_categories"),
        (CoachingLog, "coaching_logs"),
    ]

    for model, key in models:
        rows = db.query(model).filter(model.lob.isnot(None)).all()
        for row in rows:
            current_lob = (row.lob or "").strip()
            replacement = LEGACY_LOB_NAME_MAP.get(current_lob)
            if replacement and replacement != current_lob:
                row.lob = replacement
                updated_counts[key] += 1

    db.flush()
    return updated_counts


def rename_lob_references(db: Session, *, old_name: str, new_name: str) -> dict[str, int]:
    updated_counts = {
        "users": 0,
        "scenarios": 0,
        "batches": 0,
        "courses": 0,
        "mcq_categories": 0,
        "coaching_logs": 0,
    }

    if old_name == new_name:
        return updated_counts

    models = [
        (User, "users"),
        (Scenario, "scenarios"),
        (Batch, "batches"),
        (Course, "courses"),
        (MCQCategory, "mcq_categories"),
        (CoachingLog, "coaching_logs"),
    ]

    for model, key in models:
        rows = db.query(model).filter(model.lob == old_name).all()
        for row in rows:
            row.lob = new_name
            updated_counts[key] += 1

    db.flush()
    return updated_counts
