import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from default_credentials import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    DEFAULT_TRAINEE_PASSWORD,
    TRAINEE_EMAIL,
    TRAINEE_PASSWORD,
    TRAINER_EMAIL,
    TRAINER_PASSWORD,
)
from models import User, UserRole
import auth_utils


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


def reset_credentials() -> None:
    db = SessionLocal()
    try:
        # 1) Ensure specified accounts exist with exact credentials
        _upsert_user(db, ADMIN_EMAIL, "Admin User", UserRole.ADMIN, ADMIN_PASSWORD)
        _upsert_user(db, TRAINER_EMAIL, "Trainer User", UserRole.TRAINER, TRAINER_PASSWORD)
        _upsert_user(db, TRAINEE_EMAIL, "Trainee User", UserRole.TRAINEE, TRAINEE_PASSWORD)

        # 1.5) Migrate legacy seeded emails to the new stpetervelle.edu.ph domain.
        for old_email, new_email in {
            "admin@stpeterville.edu.ph": ADMIN_EMAIL,
            "training@stpeterville.edu.ph": "training@stpetervelle.edu.ph",
            "sample.trainee1@stpeterville.edu.ph": "sample.trainee1@stpetervelle.edu.ph",
            "sample.trainee2@stpeterville.edu.ph": "sample.trainee2@stpetervelle.edu.ph",
        }.items():
            existing = db.query(User).filter(User.email == old_email).first()
            if existing:
                existing.email = new_email

        # 2) Reset all other trainee passwords to default
        db.query(User).filter(User.role == UserRole.TRAINEE).update({
            "password_hash": auth_utils.hash_password(DEFAULT_TRAINEE_PASSWORD)
        })

        db.commit()
        print("Credentials reset successfully!")
        print(f"Admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"Trainer: {TRAINER_EMAIL} / {TRAINER_PASSWORD}")
        print(f"Trainee: {TRAINEE_EMAIL} / {TRAINEE_PASSWORD}")
        print(f"All trainees: {DEFAULT_TRAINEE_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    reset_credentials()