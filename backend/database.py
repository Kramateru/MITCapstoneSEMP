"""Database configuration and session management for Supabase Postgres."""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool
from .env_loader import load_backend_environment, resolve_database_url

load_backend_environment()

# Database configuration
DATABASE_URL = resolve_database_url()

# Create Base for ORM models
Base = declarative_base()

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={
        "connect_timeout": 5,
        "keepalives_idle": 30,
    },
    echo=False,
)


# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()  # Rollback on errors
        raise
    finally:
        db.close()
