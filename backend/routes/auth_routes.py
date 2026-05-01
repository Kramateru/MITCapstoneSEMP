"""
Authentication Routes  
Handles login, JWT tokens, and session management
"""

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from jose import JWTError, jwt
import os

from .. import auth_utils
from ..database import get_db
from ..default_credentials import DEFAULT_TRAINEE_PASSWORD
from ..models import User, UserRole
from ..schemas import LoginRequest, LoginResponse, UserResponse, ChangePasswordRequest, SuccessResponse
from ..services.supabase_auth_service import (
    SupabaseAuthenticationError,
    SupabaseAuthConfigurationError,
    SupabaseAuthServiceError,
    authenticate_supabase_credentials,
    get_auth_provider_status,
)
from ..services.lob_catalog import list_active_lobs, serialize_lobs

router = APIRouter(prefix="/api/auth", tags=["auth"])

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """User login endpoint"""
    normalized_email = credentials.email.strip().lower()

    try:
        authenticate_supabase_credentials(db, normalized_email, credentials.password)
    except SupabaseAuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    except SupabaseAuthConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except SupabaseAuthServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your Supabase account does not have a platform profile.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Create tokens
    access_token = auth_utils.create_access_token(user.id, user.email, user.role.value)
    refresh_token = auth_utils.create_refresh_token(user.id, user.email, user.role.value)
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    must_change_password = (
        user.role == UserRole.TRAINEE
        and auth_utils.verify_password(DEFAULT_TRAINEE_PASSWORD, user.password_hash)
    )
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.from_orm(user),
        must_change_password=must_change_password,
    )


@router.post("/logout", response_model=SuccessResponse)
async def logout(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Logout endpoint (client-side cleanup)"""
    # Token validation is handled by the dependency
    return SuccessResponse(message="Logged out successfully")


@router.get("/provider-status")
async def auth_provider_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Return the active credential source used by the login flow."""
    return get_auth_provider_status(db)


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(auth_utils.get_current_user),
):
    """Get current user's profile"""
    return UserResponse.from_orm(current_user)


@router.post("/refresh-token")
async def refresh_token(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Refresh access token using either access token or refresh token"""
    # Try to get token from Authorization header
    token_to_use = authorization or (request.headers.get("Authorization") if request else None)
    
    if not token_to_use:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )
    
    # Extract token from "Bearer <token>"
    try:
        scheme, token = token_to_use.split()
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
    
    # Try to decode token - accept both access and refresh tokens
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        email: str = payload.get("email")
        role: str = payload.get("role")
        
        if not user_id or not email or not role:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    # Create new tokens
    access_token = auth_utils.create_access_token(user.id, user.email, user.role.value)
    refresh_token_new = auth_utils.create_refresh_token(user.id, user.email, user.role.value)

    must_change_password = (
        user.role == UserRole.TRAINEE
        and auth_utils.verify_password(DEFAULT_TRAINEE_PASSWORD, user.password_hash)
    )
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token_new,
        user=UserResponse.from_orm(user),
        must_change_password=must_change_password,
    )


@router.get("/verify-token", response_model=dict)
async def verify_token_endpoint(
    current_user: User = Depends(auth_utils.get_current_user),
):
    """Verify that token is valid"""
    return {
        "valid": True,
        "user_id": current_user.id,
        "role": current_user.role.value,
        "user_name": current_user.full_name,
    }


@router.get("/lobs", response_model=dict)
async def get_lob_catalog(
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """Return the active LOB catalog for authenticated users."""
    lobs = list_active_lobs(db)
    return {
        "count": len(lobs),
        "lobs": serialize_lobs(db, lobs),
    }
