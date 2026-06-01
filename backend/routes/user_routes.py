"""
User Management Routes
Handles user CRUD operations, authentication, and profile management
"""

import uuid
import logging
import re
from typing import Any, List, Optional

from sqlalchemy import func
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..default_credentials import DEFAULT_TRAINEE_PASSWORD
from ..models import User, UserRole
from ..services.supabase_auth_service import (
    SupabaseAuthenticationError,
    SupabaseAuthConfigurationError,
    SupabaseAuthInputError,
    SupabaseAuthServiceError,
    SupabaseUserSyncError,
    authenticate_supabase_credentials,
    find_platform_user_for_supabase_session,
    get_supabase_session_user_identity,
    realign_platform_user_with_supabase_session,
    sync_user_to_supabase_auth,
)
from ..services.session_service import (
    get_session_timeout_seconds,
    start_login_session,
    strict_single_session_enabled,
)
from ..services.audit import create_audit_log, snapshot_model
from ..supabase_client import get_supabase_client
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
logger = logging.getLogger(__name__)
ALLOWED_PROFILE_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024
MIN_FULL_NAME_LENGTH = 2
MAX_FULL_NAME_LENGTH = 100
PASSWORD_COMPLEXITY_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$"
)
AUDIT_USER_FIELDS = (
    "id",
    "email",
    "full_name",
    "role",
    "department",
    "language_dialect",
    "theme",
    "layout",
    "big_font",
    "high_contrast",
    "profile_image_url",
    "is_active",
    "last_login",
)


def _audit_user_snapshot(user: User) -> dict[str, Any]:
    return snapshot_model(user, AUDIT_USER_FIELDS)


def _write_user_audit(
    db: Session,
    *,
    actor: Optional[User],
    request: Optional[Request],
    action_type: str,
    target_user: User,
    description: str,
    old_data: Optional[dict[str, Any]] = None,
    new_data: Optional[dict[str, Any]] = None,
    status_value: str = "success",
    severity: str = "info",
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    try:
        create_audit_log(
            db,
            user=actor,
            request=request,
            action_type=action_type,
            module_name="User Management",
            entity_type="user",
            entity_id=target_user.id,
            description=description,
            old_data=old_data,
            new_data=new_data,
            status=status_value,
            severity=severity,
            trainee_id=target_user.id if target_user.role == UserRole.TRAINEE else None,
            trainer_id=target_user.id if target_user.role == UserRole.TRAINER else None,
            metadata=metadata,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Unable to write user audit log for action=%s user_id=%s", action_type, target_user.id)


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _validate_password_or_raise(password: Optional[str], *, field_name: str = "Password") -> str:
    try:
        return auth_utils.validate_password_length(password, field_name=field_name)
    except auth_utils.PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


def _validate_full_name_or_raise(value: Optional[str]) -> str:
    full_name = (value or "").strip()
    if len(full_name) < MIN_FULL_NAME_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name must be at least 2 characters.",
        )
    if len(full_name) > MAX_FULL_NAME_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name must be 100 characters or fewer.",
        )
    return full_name


def _validate_strong_password_or_raise(password: Optional[str], *, field_name: str = "Password") -> str:
    normalized_password = _validate_password_or_raise(password, field_name=field_name)
    if not PASSWORD_COMPLEXITY_PATTERN.match(normalized_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{field_name} must be at least 8 characters and include uppercase, "
                "lowercase, number, and special character."
            ),
        )
    return normalized_password


def _apply_self_profile_updates(current_user: User, user_update: UserUpdate, db: Session) -> None:
    if user_update.email is not None:
        normalized_email = user_update.email.strip().lower()
        existing_user = (
            db.query(User)
            .filter(func.lower(User.email) == normalized_email, User.id != current_user.id)
            .first()
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already in use by another account",
            )
        current_user.email = normalized_email

    if user_update.full_name is not None:
        current_user.full_name = _validate_full_name_or_raise(user_update.full_name)

    if user_update.department is not None:
        current_user.department = _normalize_optional_text(user_update.department)
    if user_update.language_dialect is not None:
        current_user.language_dialect = _normalize_optional_text(user_update.language_dialect) or "en-US"
    if user_update.theme is not None:
        current_user.theme = user_update.theme
    if user_update.layout is not None:
        current_user.layout = user_update.layout
    if user_update.big_font is not None:
        current_user.big_font = user_update.big_font
    if user_update.high_contrast is not None:
        current_user.high_contrast = user_update.high_contrast


def _apply_admin_user_updates(user: User, user_update: UserUpdate, db: Session) -> None:
    if user_update.email is not None:
        normalized_email = user_update.email.strip().lower()
        existing_user = (
            db.query(User)
            .filter(func.lower(User.email) == normalized_email, User.id != user.id)
            .first()
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already in use by another account",
            )
        user.email = normalized_email

    if user_update.full_name is not None:
        user.full_name = _validate_full_name_or_raise(user_update.full_name)

    if user_update.department is not None:
        user.department = _normalize_optional_text(user_update.department)
    if user_update.language_dialect is not None:
        user.language_dialect = _normalize_optional_text(user_update.language_dialect) or "en-US"


def _delete_profile_image(profile_image_url: Optional[str]) -> None:
    if not profile_image_url:
        return

    get_supabase_client().delete_by_public_url(profile_image_url)


def _sync_user_to_supabase_or_raise(
    db: Session,
    user: User,
    *,
    update_password: bool = False,
) -> None:
    try:
        sync_user_to_supabase_auth(db, user, update_password=update_password)
    except SupabaseUserSyncError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Register a new user"""
    # Check if email already exists
    normalized_email = user_data.email.strip().lower()
    existing_user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
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
    effective_password = _validate_password_or_raise(effective_password)

    # Create new user
    new_user = User(
        email=normalized_email,
        full_name=_validate_full_name_or_raise(user_data.full_name),
        password_hash=auth_utils.hash_password(effective_password),
        role=user_data.role,
        department=user_data.department,
        language_dialect=user_data.language_dialect,
        theme=user_data.theme,
        layout=user_data.layout,
        big_font=user_data.big_font,
        high_contrast=user_data.high_contrast,
    )
    
    db.add(new_user)
    db.flush()
    try:
        _sync_user_to_supabase_or_raise(db, new_user, update_password=True)
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    db.refresh(new_user)

    _write_user_audit(
        db,
        actor=new_user,
        request=request,
        action_type="user_created",
        target_user=new_user,
        description=f"User account created for {new_user.email}.",
        new_data=_audit_user_snapshot(new_user),
        severity="info",
        metadata={"source": "self_registration"},
    )
    
    return UserResponse.from_orm(new_user)


@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """User login with Supabase-authenticated email and password"""
    normalized_email = credentials.email.strip().lower()

    supabase_session: dict[str, Any] = {}
    try:
        supabase_session = authenticate_supabase_credentials(db, normalized_email, credentials.password)
    except SupabaseAuthInputError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
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

    session_user_id, session_user_email = get_supabase_session_user_identity(supabase_session)
    user = find_platform_user_for_supabase_session(
        db,
        supabase_session,
        fallback_email=normalized_email,
    )

    if not user:
        logger.warning(
            "Supabase account %s (session email=%s user_id=%s) is missing a platform profile",
            normalized_email,
            session_user_email,
            session_user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your Supabase account does not have a platform profile.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    realign_platform_user_with_supabase_session(
        user,
        session_payload=supabase_session,
        successful_password=credentials.password,
    )
    user.last_login = __import__('datetime').datetime.utcnow()
    login_session = start_login_session(db, user, request)

    # Platform login succeeds once the shared credential hash is verified and no active session exists.
    access_token = auth_utils.create_access_token(
        user.id,
        user.email,
        user.role.value,
        login_session.session_id,
    )
    refresh_token = auth_utils.create_refresh_token(
        user.id,
        user.email,
        user.role.value,
        login_session.session_id,
    )
    db.commit()
    db.refresh(user)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        session_id=login_session.session_id,
        supabase_access_token=supabase_session.get("access_token"),
        supabase_refresh_token=supabase_session.get("refresh_token"),
        supabase_expires_at=supabase_session.get("expires_at"),
        supabase_expires_in=supabase_session.get("expires_in"),
        strict_single_session=strict_single_session_enabled(),
        session_timeout_seconds=get_session_timeout_seconds(),
        user=UserResponse.from_orm(user),
        must_change_password=(
            user.role == UserRole.TRAINEE
            and auth_utils.verify_password(DEFAULT_TRAINEE_PASSWORD, user.password_hash)
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get current user profile"""
    current_user = await auth_utils.get_current_user(authorization, db)
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Update current user profile"""
    current_user = await auth_utils.get_current_user(authorization, db)
    old_data = _audit_user_snapshot(current_user)

    _apply_self_profile_updates(current_user, user_update, db)
    try:
        _sync_user_to_supabase_or_raise(db, current_user)
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    db.refresh(current_user)

    _write_user_audit(
        db,
        actor=current_user,
        request=request,
        action_type="profile_updated",
        target_user=current_user,
        description=f"{current_user.full_name} updated their profile.",
        old_data=old_data,
        new_data=_audit_user_snapshot(current_user),
        severity="info",
    )

    return UserResponse.from_orm(current_user)


@router.post("/me/profile-image", response_model=SuccessResponse)
async def upload_current_user_profile_image(
    request: Request,
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Upload or replace the current user's profile image."""
    current_user = await auth_utils.get_current_user(authorization, db)
    old_data = _audit_user_snapshot(current_user)

    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    extension = ALLOWED_PROFILE_IMAGE_TYPES.get(content_type)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile picture must be a JPG, PNG, or WEBP image",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

    if len(file_bytes) > MAX_PROFILE_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Profile picture must be 5 MB or smaller",
        )

    new_filename = f"{current_user.id}_{uuid.uuid4().hex}.{extension}"
    new_profile_image_url: Optional[str] = None

    supabase = get_supabase_client()
    new_profile_image_url = supabase.upload_profile_image(
        file_data=file_bytes,
        user_id=current_user.id,
        filename=new_filename,
        content_type=content_type,
    )

    if not new_profile_image_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Profile image upload failed. Try again in a moment.",
        )

    previous_profile_image_url = current_user.profile_image_url
    current_user.profile_image_url = new_profile_image_url
    try:
        _sync_user_to_supabase_or_raise(db, current_user)
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    db.refresh(current_user)

    _write_user_audit(
        db,
        actor=current_user,
        request=request,
        action_type="profile_image_uploaded",
        target_user=current_user,
        description=f"{current_user.full_name} uploaded a profile image.",
        old_data=old_data,
        new_data=_audit_user_snapshot(current_user),
        severity="info",
        metadata={"content_type": content_type, "file_size": len(file_bytes)},
    )

    if previous_profile_image_url and previous_profile_image_url != new_profile_image_url:
        _delete_profile_image(previous_profile_image_url)

    return SuccessResponse(
        message="Profile picture updated successfully",
        data={
            "profile_image_url": current_user.profile_image_url,
            "user": UserResponse.from_orm(current_user).model_dump(),
        },
    )


@router.delete("/me/profile-image", response_model=SuccessResponse)
async def delete_current_user_profile_image(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Remove the current user's profile image."""
    current_user = await auth_utils.get_current_user(authorization, db)
    old_data = _audit_user_snapshot(current_user)
    previous_profile_image_url = current_user.profile_image_url
    current_user.profile_image_url = None
    try:
        _sync_user_to_supabase_or_raise(db, current_user)
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    db.refresh(current_user)

    _write_user_audit(
        db,
        actor=current_user,
        request=request,
        action_type="profile_image_deleted",
        target_user=current_user,
        description=f"{current_user.full_name} removed their profile image.",
        old_data=old_data,
        new_data=_audit_user_snapshot(current_user),
        severity="info",
    )

    if previous_profile_image_url:
        _delete_profile_image(previous_profile_image_url)

    return SuccessResponse(
        message="Profile picture removed successfully",
        data={
            "profile_image_url": None,
            "user": UserResponse.from_orm(current_user).model_dump(),
        },
    )


@router.post("/change-password", response_model=SuccessResponse)
async def change_password(
    password_change: ChangePasswordRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Change user password"""
    current_user = await auth_utils.get_current_user(authorization, db)
    old_password = _validate_password_or_raise(password_change.old_password, field_name="Old password")
    new_password = _validate_strong_password_or_raise(password_change.new_password, field_name="New password")

    try:
        authenticate_supabase_credentials(db, current_user.email, old_password)
    except SupabaseAuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Old password is incorrect",
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

    # Prevent reusing the same password
    if old_password == new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the old password"
        )
    
    # Update password
    current_user.password_hash = auth_utils.hash_password(new_password)
    db.flush()
    try:
        _sync_user_to_supabase_or_raise(db, current_user, update_password=True)
    except HTTPException:
        db.rollback()
        raise
    db.commit()

    _write_user_audit(
        db,
        actor=current_user,
        request=request,
        action_type="password_changed",
        target_user=current_user,
        description=f"{current_user.full_name} changed their password.",
        new_data={"password_changed": True},
        severity="warning",
    )
    
    return SuccessResponse(message="Password changed successfully")


@router.get("", response_model=List[UserResponse])
async def list_users(
    role: Optional[UserRole] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    authorization: Optional[str] = Header(None),
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
    authorization: Optional[str] = Header(None),
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
    request: Request,
    authorization: Optional[str] = Header(None),
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

    old_data = _audit_user_snapshot(user)
    _apply_admin_user_updates(user, user_update, db)
    try:
        _sync_user_to_supabase_or_raise(db, user)
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    db.refresh(user)

    new_data = _audit_user_snapshot(user)
    changed = [field for field in old_data if old_data.get(field) != new_data.get(field)]
    action_type = "role_changed" if "role" in changed else "user_updated"
    _write_user_audit(
        db,
        actor=current_user,
        request=request,
        action_type=action_type,
        target_user=user,
        description=f"Admin {current_user.email} updated user {user.email}.",
        old_data=old_data,
        new_data=new_data,
        severity="warning" if action_type == "role_changed" else "info",
        metadata={"changed_fields": changed},
    )

    return UserResponse.from_orm(user)


@router.delete("/{user_id}", response_model=SuccessResponse)
async def delete_user(
    user_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
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
    
    old_data = _audit_user_snapshot(user)
    # Soft delete
    user.is_active = False
    db.commit()
    db.refresh(user)

    _write_user_audit(
        db,
        actor=current_user,
        request=request,
        action_type="user_deactivated",
        target_user=user,
        description=f"Admin {current_user.email} deactivated user {user.email}.",
        old_data=old_data,
        new_data=_audit_user_snapshot(user),
        severity="warning",
    )
    
    return SuccessResponse(message="User deactivated successfully")
