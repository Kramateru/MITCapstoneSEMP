import sys
import os

os.environ.setdefault("USE_LOCAL_SQLITE", "1")

CURRENT_DIR = os.path.dirname(__file__)
REPO_ROOT = os.path.dirname(CURRENT_DIR)
sys.path.insert(0, REPO_ROOT)

from backend.database import SessionLocal
from backend.default_credentials import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    DEFAULT_TRAINEE_PASSWORD,
    SAMPLE_TRAINEE_ACCOUNTS,
    TRAINEE_EMAIL,
    TRAINEE_PASSWORD,
    TRAINER_EMAIL,
    TRAINER_PASSWORD,
)
from backend.models import User, UserRole
from backend import auth_utils


def _upsert_user(db, email: str, full_name: str, role: UserRole, password: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
    user.full_name = full_name
    user.role = role
    user.is_active = True
    user.password_hash = auth_utils.hash_password(password)
    return user


def _migrate_legacy_email(db, old_email: str, new_email: str) -> None:
    legacy_user = db.query(User).filter(User.email == old_email).first()
    if not legacy_user:
        return

    canonical_user = db.query(User).filter(User.email == new_email).first()
    if canonical_user and canonical_user.id != legacy_user.id:
        legacy_user.is_active = False
        return

    legacy_user.email = new_email


def reset_credentials() -> None:
    db = SessionLocal()
    try:
        # 1) Migrate legacy seeded emails before upserting canonical accounts.
        for old_email, new_email in {
            "admin@stpeterville.edu.ph": ADMIN_EMAIL,
            "training@stpeterville.edu.ph": "training@stpetervelle.edu.ph",
            "sample.trainee1@stpeterville.edu.ph": "sample.trainee1@stpetervelle.edu.ph",
            "sample.trainee2@stpeterville.edu.ph": "sample.trainee2@stpetervelle.edu.ph",
        }.items():
            _migrate_legacy_email(db, old_email, new_email)
        db.flush()

        # 2) Ensure specified accounts exist with exact credentials
        _upsert_user(db, ADMIN_EMAIL, "Admin User", UserRole.ADMIN, ADMIN_PASSWORD)
        _upsert_user(db, TRAINER_EMAIL, "Trainer User", UserRole.TRAINER, TRAINER_PASSWORD)
        _upsert_user(db, TRAINEE_EMAIL, "Trainee User", UserRole.TRAINEE, TRAINEE_PASSWORD)
        for sample_trainee in SAMPLE_TRAINEE_ACCOUNTS:
            _upsert_user(
                db,
                sample_trainee["email"],
                sample_trainee["full_name"],
                UserRole.TRAINEE,
                DEFAULT_TRAINEE_PASSWORD,
            )

        # 3) Reset all other trainee passwords to default
        db.query(User).filter(User.role == UserRole.TRAINEE).update({
            "password_hash": auth_utils.hash_password(DEFAULT_TRAINEE_PASSWORD)
        })

        db.commit()
        print("Credentials reset successfully!")
        print(f"Admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"Trainer: {TRAINER_EMAIL} / {TRAINER_PASSWORD}")
        print(f"Trainee: {TRAINEE_EMAIL} / {TRAINEE_PASSWORD}")
        for sample_trainee in SAMPLE_TRAINEE_ACCOUNTS:
            print(
                f"Sample trainee: {sample_trainee['email']} / {DEFAULT_TRAINEE_PASSWORD}"
            )
        print(f"All trainees: {DEFAULT_TRAINEE_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    reset_credentials()
