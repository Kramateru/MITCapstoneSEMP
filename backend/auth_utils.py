"""
Authentication and security utilities for JWT token handling and password management.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .database import get_db
from .models import User, UserRole
from .services.session_service import validate_user_session

logger = logging.getLogger(__name__)

# Passlib 1.7 expects bcrypt.__about__.__version__, which bcrypt 4.x no longer exposes.
if not hasattr(bcrypt, "__about__"):
    class _BcryptAbout:
        __version__ = getattr(bcrypt, "__version__", "unknown")

    bcrypt.__about__ = _BcryptAbout()

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
BCRYPT_PASSWORD_MAX_BYTES = 72
PASSWORD_TOO_LONG_MESSAGE = f"Password must not exceed {BCRYPT_PASSWORD_MAX_BYTES} bytes."
PASSWORD_REQUIRED_MESSAGE = "Password is required."


class TokenData(BaseModel):
    """Token payload data"""
    user_id: str
    email: str
    role: str
    session_id: Optional[str] = None
    token_type: str = "access"


class TokenResponse(BaseModel):
    """Token response"""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int


# ===================== Password Management =====================

class PasswordValidationError(ValueError):
    """Raised when a password cannot be processed safely."""


def get_password_byte_length(password: Optional[str]) -> int:
    """Return the UTF-8 byte length used by bcrypt's 72-byte limit."""
    return len((password or "").encode("utf-8"))


def validate_password_length(
    password: Optional[str],
    *,
    field_name: str = "Password",
    allow_empty: bool = False,
) -> str:
    """
    Validate password input before handing it to bcrypt.

    Bcrypt only processes the first 72 bytes of the password. Rejecting longer
    inputs avoids silent truncation and confusing login mismatches.
    """
    normalized_password = password if isinstance(password, str) else ""

    if not normalized_password and not allow_empty:
        if field_name == "Password":
            raise PasswordValidationError(PASSWORD_REQUIRED_MESSAGE)
        raise PasswordValidationError(f"{field_name} is required.")

    if get_password_byte_length(normalized_password) > BCRYPT_PASSWORD_MAX_BYTES:
        raise PasswordValidationError(PASSWORD_TOO_LONG_MESSAGE)

    return normalized_password


def hash_password(password: str) -> str:
    """Hash a password using bcrypt after validating its byte length."""
    normalized_password = validate_password_length(password)
    try:
        return bcrypt.hashpw(normalized_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except ValueError as exc:
        logger.warning("Password hashing error: %s", exc)
        raise


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a stored hash without exposing password input."""
    try:
        normalized_password = validate_password_length(plain_password)
    except PasswordValidationError as exc:
        logger.info("Rejected password verification input: %s", exc)
        return False

    if not hashed_password:
        logger.warning("Password verification skipped because the stored hash is empty.")
        return False

    try:
        hashed_bytes = (
            hashed_password.encode("utf-8")
            if isinstance(hashed_password, str)
            else hashed_password
        )
        return bcrypt.checkpw(normalized_password.encode("utf-8"), hashed_bytes)
    except (ValueError, TypeError, AttributeError) as exc:
        logger.warning("Password verification error: %s", exc)
        return False


# ===================== JWT Token Management =====================

def create_access_token(
    user_id: str, 
    email: str, 
    role: str, 
    session_id: Optional[str] = None,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token"""
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    expire = datetime.utcnow() + expires_delta
    to_encode = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "session_id": session_id,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    }
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(user_id: str, email: str, role: str, session_id: Optional[str] = None) -> str:
    """Create a JWT refresh token"""
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "session_id": session_id,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh"
    }
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str, allowed_types: Optional[set[str]] = None) -> TokenData:
    """Decode and validate a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        email: str = payload.get("email")
        role: str = payload.get("role")
        session_id: Optional[str] = payload.get("session_id")
        token_type: str = payload.get("type") or "access"
        
        if user_id is None or email is None or role is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if allowed_types and token_type not in allowed_types:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return TokenData(
            user_id=user_id,
            email=email,
            role=role,
            session_id=session_id,
            token_type=token_type,
        )
    
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_token(token: str) -> TokenData:
    """Verify a token and return token data"""
    return decode_token(token, allowed_types={"access"})


def validate_current_session(db: Session, user: User, token_data: TokenData):
    """Validate that the token belongs to the active server-side login session.
    
    Returns the UserSession if found and valid, or None if session table unavailable.
    Raises HTTPException if there's a forced logout (different active session).
    """
    result = validate_user_session(db, user, token_data.session_id)
    # If result is None, it could mean session doesn't exist or table is unavailable
    # In either case, we'll handle it in get_current_user
    return result


# ===================== Dependency: Get Current User =====================

async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """Dependency to get the current authenticated user from token.
    
    This function can be used as a FastAPI dependency with automatic header extraction,
    or called directly with an explicit authorization token.
    
    Session validation is attempted but won't block access if the session table is unavailable.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract token from "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication scheme",
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )
    
    token_data = decode_token(token, allowed_types={"access"})
    user = db.query(User).filter(User.id == token_data.user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    # Attempt session validation (may return None if table unavailable, or raise exception if forced logout)
    validate_current_session(db, user, token_data)
    
    return user


# ===================== Role-Based Access Control =====================

def require_role(*roles: UserRole):
    """Dependency to require specific roles"""
    async def check_role(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return check_role


def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def require_trainer(current_user: User = Depends(get_current_user)):
    """Dependency to require trainer role"""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer privileges required",
        )
    return current_user


def require_trainee(current_user: User = Depends(get_current_user)):
    """Dependency to require trainee role"""
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainee role required",
        )
    return current_user
