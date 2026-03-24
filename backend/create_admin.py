from . import auth_utils
from .database import SessionLocal, engine, Base
from .models import User, UserRole

# Create all tables first
Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    # Check if admin already exists
    existing = db.query(User).filter(User.email == "admin@stpeterville.edu.ph").first()
    if existing:
        print("Admin user already exists")
    else:
        # Create new admin user
        admin = User(
            email="admin@stpeterville.edu.ph",
            full_name="Admin User",
            password_hash=auth_utils.hash_password("Admin@SPV"),
            role=UserRole.ADMIN,
            is_active=True,
            lob="Administration",
            department="Management"
        )
        db.add(admin)
        db.commit()
        print("Admin user created successfully!")
        print(f"Email: admin@stpeterville.edu.ph")
        print(f"Password: Admin@SPV")
finally:
    db.close()
