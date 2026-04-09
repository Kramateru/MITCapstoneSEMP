"""
Database configuration and session management
Supports both SQLite (development) and PostgreSQL/Supabase (production)
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool, QueuePool
from .env_loader import load_backend_environment, resolve_database_url

load_backend_environment()

# Database configuration
DATABASE_URL = resolve_database_url()

# Create Base for ORM models
Base = declarative_base()

# Determine database type and create engine accordingly
if "postgresql" in DATABASE_URL:
    # PostgreSQL/Supabase configuration
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=10,  # Increased from 5
        max_overflow=20,  # Increased from 10
        pool_pre_ping=True,  # Verify connections before using
        pool_recycle=3600,  # Recycle connections after 1 hour
        connect_args={
            "connect_timeout": 5,  # Don't hang forever
            "keepalives_idle": 30  # Keep connections alive
        },
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
    except Exception:
        db.rollback()  # Rollback on errors
        raise
    finally:
        db.close()
