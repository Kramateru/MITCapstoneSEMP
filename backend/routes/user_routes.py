"""
User Management Routes
Handles user CRUD operations, authentication, and profile management
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import auth_utils
from ..database import get_db
from ..models import User, UserRole
from ..schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    SuccessResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/api/users", tags=["users"])
DEFAULT_TRAINEE_PASSWORD = "SPVTrainee2024"


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Enforce role-based password defaults/requirements
    effective_password = user_data.password
    if user_data.role == UserRole.TRAINEE and not effective_password:
        effective_password = DEFAULT_TRAINEE_PASSWORD
    if user_data.role != UserRole.TRAINEE and not effective_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required for admin/trainer accounts"
        )

    # Create new user
    new_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=auth_utils.hash_password(effective_password),
        role=user_data.role,
        lob=user_data.lob,
        department=user_data.department,
        language_dialect=user_data.language_dialect,
        theme=user_data.theme,
        layout=user_data.layout,
        big_font=user_data.big_font,
        high_contrast=user_data.high_contrast,
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return UserResponse.from_orm(new_user)


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """User login with email and password"""
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
    user.last_login = __import__('datetime').datetime.utcnow()
    db.commit()
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.from_orm(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get current user profile"""
    current_user = await auth_utils.get_current_user(authorization, db)
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Update current user profile"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Update fields
    if user_update.full_name:
        current_user.full_name = user_update.full_name
    if user_update.lob:
        current_user.lob = user_update.lob
    if user_update.department:
        current_user.department = user_update.department
    if user_update.language_dialect:
        current_user.language_dialect = user_update.language_dialect
    if user_update.theme:
        current_user.theme = user_update.theme
    if user_update.layout:
        current_user.layout = user_update.layout
    if user_update.big_font is not None:
        current_user.big_font = user_update.big_font
    if user_update.high_contrast is not None:
        current_user.high_contrast = user_update.high_contrast
    
    db.commit()
    db.refresh(current_user)
    
    return UserResponse.from_orm(current_user)


@router.post("/change-password", response_model=SuccessResponse)
async def change_password(
    password_change: ChangePasswordRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Change user password"""
    current_user = await auth_utils.get_current_user(authorization, db)

    # Verify old password
    if not auth_utils.verify_password(password_change.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Old password is incorrect"
        )

    # Prevent reusing the same password
    if password_change.old_password == password_change.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the old password"
        )
    
    # Update password
    current_user.password_hash = auth_utils.hash_password(password_change.new_password)
    db.commit()
    
    return SuccessResponse(message="Password changed successfully")


@router.get("", response_model=List[UserResponse])
async def list_users(
    role: Optional[UserRole] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all users (admin only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    
    users = query.offset(skip).limit(limit).all()
    return [UserResponse.from_orm(u) for u in users]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get user by ID"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Users can only view their own profile unless they're admin
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse.from_orm(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Update user (admin only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update fields
    if user_update.full_name:
        user.full_name = user_update.full_name
    if user_update.lob:
        user.lob = user_update.lob
    if user_update.department:
        user.department = user_update.department
    if user_update.language_dialect:
        user.language_dialect = user_update.language_dialect
    
    db.commit()
    db.refresh(user)
    
    return UserResponse.from_orm(user)


@router.delete("/{user_id}", response_model=SuccessResponse)
async def delete_user(
    user_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Deactivate user (admin only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Soft delete
    user.is_active = False
    db.commit()
    
    return SuccessResponse(message="User deactivated successfully")
