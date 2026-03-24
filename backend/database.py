"""
Database configuration and session management
Supports both SQLite (development) and PostgreSQL/Supabase (production)
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool, QueuePool
from sqlalchemy.ext.declarative import declarative_base

# Load environment variables (prefer repo root .env)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL", "sqlite:///./test.db"  # Default to SQLite for development
)

# Create Base for ORM models
Base = declarative_base()

# Determine database type and create engine accordingly
if "postgresql" in DATABASE_URL:
    # PostgreSQL/Supabase configuration
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,  # Verify connections before using
        echo=False,
    )
else:
    # SQLite configuration (development)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )


# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
