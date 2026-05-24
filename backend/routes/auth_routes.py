"""
Authentication Routes  
Handles login, JWT tokens, and session management
"""

from datetime import datetime
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
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
    SupabaseAuthInputError,
    SupabaseAuthServiceError,
    authenticate_supabase_credentials,
    get_auth_provider_status,
    issue_supabase_session,
    refresh_supabase_session,
)
from ..services.lob_catalog import list_active_lobs, serialize_lobs

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"

ROLE_HOME_PATHS = {
    UserRole.ADMIN: "/admin/dashboard",
    UserRole.TRAINER: "/trainer/dashboard",
    UserRole.TRAINEE: "/trainee/dashboard",
}


def _build_login_batch_context(user: User) -> dict[str, Any]:
    if user.role != UserRole.TRAINEE:
        return {
            "batch_id": None,
            "batch_name": None,
            "wave_number": None,
        }

    batches = [batch for batch in user.batches if batch is not None]
    if not batches:
        return {
            "batch_id": None,
            "batch_name": None,
            "wave_number": None,
        }

    active_batches = [batch for batch in batches if getattr(batch, "is_active", True)]
    candidate_batches = active_batches or batches
    selected_batch = sorted(
        candidate_batches,
        key=lambda batch: (
            batch.wave_number is None,
            batch.wave_number or 0,
            (batch.name or "").lower(),
        ),
    )[0]

    return {
        "batch_id": selected_batch.id,
        "batch_name": selected_batch.name,
        "wave_number": selected_batch.wave_number,
    }


def _auth_error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "message": message,
        },
    )


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """User login endpoint"""
    normalized_email = credentials.email.strip().lower()
    logger.info("Login endpoint reached for %s", normalized_email)

    try:
        authenticate_supabase_credentials(db, normalized_email, credentials.password)
    except SupabaseAuthInputError as exc:
        logger.info("Login rejected for %s due to invalid input: %s", normalized_email, exc)
        return _auth_error_response(status.HTTP_400_BAD_REQUEST, str(exc))
    except SupabaseAuthenticationError as exc:
        logger.info("Login rejected for %s due to failed credentials", normalized_email)
        return _auth_error_response(status.HTTP_401_UNAUTHORIZED, str(exc))
    except SupabaseAuthConfigurationError as exc:
        logger.exception("Supabase auth configuration error during login for %s", normalized_email)
        return _auth_error_response(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    except SupabaseAuthServiceError as exc:
        logger.exception("Supabase auth service error during login for %s", normalized_email)
        return _auth_error_response(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))

    logger.info("Supabase credentials validated for %s", normalized_email)

    supabase_session: dict[str, Any] = {}
    try:
        supabase_session = issue_supabase_session(normalized_email, credentials.password)
        logger.info(
            "Supabase session issued for %s with expires_at=%s",
            normalized_email,
            supabase_session.get("expires_at"),
        )
    except (
        SupabaseAuthenticationError,
        SupabaseAuthConfigurationError,
        SupabaseAuthServiceError,
    ) as exc:
        logger.warning(
            "Supabase session issuance failed for %s after credentials were verified. "
            "Continuing with backend session only: %s",
            normalized_email,
            exc,
        )

    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()

    if not user:
        logger.warning("Supabase account %s is missing a platform profile", normalized_email)
        return _auth_error_response(
            status.HTTP_403_FORBIDDEN,
            "Your Supabase account does not have a platform profile.",
        )

    if not user.is_active:
        logger.info("Inactive account blocked from login: %s", normalized_email)
        return _auth_error_response(
            status.HTTP_403_FORBIDDEN,
            "User account is inactive",
        )
    
    # Platform login succeeds once the shared credential hash is verified.
    access_token = auth_utils.create_access_token(user.id, user.email, user.role.value)
    refresh_token = auth_utils.create_refresh_token(user.id, user.email, user.role.value)
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    must_change_password = (
        user.role == UserRole.TRAINEE
        and auth_utils.verify_password(DEFAULT_TRAINEE_PASSWORD, user.password_hash)
    )
    batch_context = _build_login_batch_context(user)
    redirect_destination = ROLE_HOME_PATHS.get(user.role, "/dashboard")

    logger.info(
        "Login success for %s. role=%s redirect=%s batch_id=%s wave_number=%s",
        normalized_email,
        user.role.value,
        redirect_destination,
        batch_context.get("batch_id"),
        batch_context.get("wave_number"),
    )

    return LoginResponse(
        success=True,
        message="Login successful",
        access_token=access_token,
        refresh_token=refresh_token,
        supabase_access_token=supabase_session.get("access_token"),
        supabase_refresh_token=supabase_session.get("refresh_token"),
        supabase_expires_at=supabase_session.get("expires_at"),
        supabase_expires_in=supabase_session.get("expires_in"),
        user=UserResponse.from_orm(user),
        must_change_password=must_change_password,
        batch_id=batch_context.get("batch_id"),
        batch_name=batch_context.get("batch_name"),
        wave_number=batch_context.get("wave_number"),
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
    x_supabase_refresh_token: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Refresh access token using either access token or refresh token"""
    logger.info("Refresh token endpoint reached")
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
    batch_context = _build_login_batch_context(user)
    redirect_destination = ROLE_HOME_PATHS.get(user.role, "/dashboard")
    logger.info(
        "Refresh token issued for user_id=%s role=%s redirect=%s",
        user.id,
        user.role.value,
        redirect_destination,
    )

    supabase_session: dict[str, Any] = {}
    if x_supabase_refresh_token:
        try:
            supabase_session = refresh_supabase_session(x_supabase_refresh_token)
        except SupabaseAuthInputError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        except SupabaseAuthServiceError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
    
    return LoginResponse(
        success=True,
        message="Session refreshed",
        access_token=access_token,
        refresh_token=refresh_token_new,
        supabase_access_token=supabase_session.get("access_token"),
        supabase_refresh_token=supabase_session.get("refresh_token"),
        supabase_expires_at=supabase_session.get("expires_at"),
        supabase_expires_in=supabase_session.get("expires_in"),
        user=UserResponse.from_orm(user),
        must_change_password=must_change_password,
        batch_id=batch_context.get("batch_id"),
        batch_name=batch_context.get("batch_name"),
        wave_number=batch_context.get("wave_number"),
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
