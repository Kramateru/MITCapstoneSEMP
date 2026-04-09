import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import auth_utils
from database import SessionLocal, engine, Base
from default_credentials import ADMIN_EMAIL, ADMIN_PASSWORD
from models import User, UserRole

# Create all tables first
Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    # Check if admin already exists
    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        print("Admin user already exists")
    else:
        # Create new admin user
        admin = User(
            email=ADMIN_EMAIL,
            full_name="Admin User",
            password_hash=auth_utils.hash_password(ADMIN_PASSWORD),
            role=UserRole.ADMIN,
            is_active=True,
            lob="Administration",
            department="Management"
        )
        db.add(admin)
        db.commit()
        print("Admin user created successfully!")
        print(f"Email: {ADMIN_EMAIL}")
        print(f"Password: {ADMIN_PASSWORD}")
finally:
    db.close()