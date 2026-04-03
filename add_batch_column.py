#!/usr/bin/env python3
"""
Add missing is_active column to batch table
"""
import os
from sqlalchemy import create_engine, text

# Get database URL from environment
database_url = os.getenv('DATABASE_URL')
if not database_url:
    print("DATABASE_URL not found in environment")
    exit(1)

print(f"Connecting to database...")

engine = create_engine(database_url)

try:
    with engine.begin() as connection:
        # Check if column exists
        result = connection.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'batch' AND column_name = 'is_active'
        """))
        if result.fetchone():
            print("is_active column already exists")
        else:
            print("Adding is_active column to batch table...")
            connection.execute(text("""
                ALTER TABLE batch ADD COLUMN is_active BOOLEAN DEFAULT TRUE
            """))
            # Set existing batches to active
            connection.execute(text("""
                UPDATE batch SET is_active = TRUE WHERE is_active IS NULL
            """))
            print("is_active column added successfully")
except Exception as e:
    print(f"Error: {e}")
    exit(1)