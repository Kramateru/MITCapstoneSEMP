"""
Authentication Routes  
Handles login, JWT tokens, and session management
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import auth_utils
from ..database import get_db
from ..models import User, UserRole
from ..schemas import LoginRequest, LoginResponse, UserResponse, ChangePasswordRequest, SuccessResponse
from ..services.lob_catalog import list_active_lobs, serialize_lobs

router = APIRouter(prefix="/api/auth", tags=["auth"])
DEFAULT_TRAINEE_PASSWORD = "SPVTrainee2024"


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """User login endpoint"""
    normalized_email = credentials.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    
    if not user or not auth_utils.verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
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
async def logout(authorization: Optional[str] = None, db: Session = Depends(get_db)):
    """Logout endpoint (client-side cleanup)"""
    # Token validation is handled by the dependency
    return SuccessResponse(message="Logged out successfully")


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    authorization: Optional[str] = None,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Get current user's profile"""
    current_user = await auth_utils.get_current_user(
        authorization or request.headers.get("Authorization"),
        db,
    )
    return UserResponse.from_orm(current_user)


@router.post("/refresh-token")
async def refresh_token(
    authorization: Optional[str] = None,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Refresh access token"""
    current_user = await auth_utils.get_current_user(
        authorization or request.headers.get("Authorization"),
        db,
    )
    
    access_token = auth_utils.create_access_token(current_user.id, current_user.email, current_user.role.value)
    refresh_token = auth_utils.create_refresh_token(current_user.id, current_user.email, current_user.role.value)

    must_change_password = (
        current_user.role == UserRole.TRAINEE
        and auth_utils.verify_password(DEFAULT_TRAINEE_PASSWORD, current_user.password_hash)
    )
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.from_orm(current_user),
        must_change_password=must_change_password,
    )


@router.get("/verify-token", response_model=dict)
async def verify_token_endpoint(
    authorization: Optional[str] = None,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Verify that token is valid"""
    current_user = await auth_utils.get_current_user(
        authorization or request.headers.get("Authorization"),
        db,
    )
    return {
        "valid": True,
        "user_id": current_user.id,
        "role": current_user.role.value,
        "user_name": current_user.full_name,
    }


@router.get("/lobs", response_model=dict)
async def get_lob_catalog(
    authorization: Optional[str] = None,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Return the active LOB catalog for authenticated users."""
    await auth_utils.get_current_user(
        authorization or request.headers.get("Authorization"),
        db,
    )
    lobs = list_active_lobs(db)
    return {
        "count": len(lobs),
        "lobs": serialize_lobs(db, lobs),
    }
