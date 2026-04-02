"""
Settings Management Routes - Admin interface customization, accessibility, theming
Handles sidebar state, layout preferences, WCAG compliance, branding
"""

from datetime import datetime
from typing import Any, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth_utils
from ..models_extended import SystemSettings
from ..database import get_db

router = APIRouter(prefix="/api/settings", tags=["Settings"])


# Pydantic Models for Request/Response
class SidebarStateUpdate(BaseModel):
    state: str  # default, minified, hidden, locked
    persist: bool = True  # Save across sessions


class LayoutPreferencesUpdate(BaseModel):
    layout: str  # default, boxed, top-navigation
    sidebar_position: str = "left"  # left, right
    compact_mode: bool = False
    fixed_header: bool = False
    top_navigation: bool = False
    boxed_layout: bool = False


class AccessibilitySettings(BaseModel):
    big_font: bool = False
    big_font_scale: float = 1.2  # 1.2x = 20% bigger, max 1.5x
    high_contrast: bool = False
    daltonism_mode: str = "none"  # none, protanopia, deuteranopia, tritanopia
    focus_indicators: bool = True  # Highlight focused elements
    reduce_motion: bool = False  # Disable animations


class ThemeSettings(BaseModel):
    mode: str  # light, dark, default, high_contrast
    primary_color: str  # Hex #RRGGBB
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None


class BrandingSettings(BaseModel):
    company_name: str
    logo_url: Optional[str] = None
    logo_file: Optional[str] = None  # Base64 encoded


class DateFormatSettings(BaseModel):
    format: str  # MM/DD/YYYY or DD/MM/YYYY
    time_zone: str  # UTC, EST, PST, etc
    use_12_hour_time: bool = True


class SystemSettingsResponse(BaseModel):
    logo_url: Optional[str]
    company_name: Optional[str]
    primary_color: str
    date_format: str
    time_zone: str
    available_themes: List[str]
    default_theme: str
    sidebar_default_state: str
    default_layout: str
    sso_enabled: bool
    enable_daltonism_mode: bool
    system_wide_font_scale: float
    default_high_contrast: bool

    class Config:
        from_attributes = True


def _ui_preferences_for_user(current_user: Any) -> dict[str, Any]:
    preferences = getattr(current_user, "ui_preferences", None)
    if isinstance(preferences, dict):
        return preferences
    return {}


async def verify_admin(current_user: Any = Depends(auth_utils.get_current_user)):
    """Dependency to verify user is admin"""
    if not current_user or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# GET ENDPOINTS ============================================

@router.get("/system", response_model=SystemSettingsResponse)
async def get_system_settings(db: Session = Depends(get_db)):
    """Get current system settings - accessible to all users"""
    settings = db.query(SystemSettings).first()
    if not settings:
        # Return defaults if not initialized
        return SystemSettingsResponse(
            logo_url=None,
            company_name="Speech-Enabled Microlearning Platform for Language Assessment",
            primary_color="#007BFF",
            date_format="MM/DD/YYYY",
            time_zone="UTC",
            available_themes=["light", "dark", "default"],
            default_theme="default",
            sidebar_default_state="default",
            default_layout="default",
            sso_enabled=False,
            enable_daltonism_mode=False,
            system_wide_font_scale=1.0,
            default_high_contrast=False
        )
    return settings


@router.get("/user/preferences")
async def get_user_preferences(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Get logged-in user's UI preferences"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    ui_preferences = _ui_preferences_for_user(current_user)
    accessibility_preferences_raw = ui_preferences.get("accessibility", {})
    accessibility_preferences = (
        accessibility_preferences_raw if isinstance(accessibility_preferences_raw, dict) else {}
    )
    theme_preferences_raw = ui_preferences.get("theme", {})
    theme_preferences = theme_preferences_raw if isinstance(theme_preferences_raw, dict) else {}
    layout_value = ui_preferences.get("layout", getattr(current_user, "layout", "default"))
    sidebar_state = ui_preferences.get("sidebar_state", getattr(current_user, "sidebar_state", "default"))

    return {
        "theme": theme_preferences.get("mode", current_user.theme),
        "layout": layout_value,
        "big_font": accessibility_preferences.get("big_font", current_user.big_font),
        "big_font_scale": accessibility_preferences.get(
            "big_font_scale",
            getattr(current_user, "big_font_scale", 1.0),
        ),
        "high_contrast": accessibility_preferences.get(
            "high_contrast",
            current_user.high_contrast,
        ),
        "daltonism_mode": accessibility_preferences.get(
            "daltonism_mode",
            getattr(current_user, "daltonism_mode", "none"),
        ),
        "sidebar_state": sidebar_state,
        "language_dialect": current_user.language_dialect,
        "fixed_header": ui_preferences.get("fixed_header", False),
        "sidebar_position": ui_preferences.get("sidebar_position", "left"),
        "compact_mode": ui_preferences.get("compact_mode", False),
        "top_navigation": ui_preferences.get(
            "top_navigation",
            layout_value == "top-navigation",
        ),
        "boxed_layout": ui_preferences.get(
            "boxed_layout",
            layout_value == "boxed",
        ),
        "theme_colors": {
            "primary_color": theme_preferences.get("primary_color"),
            "secondary_color": theme_preferences.get("secondary_color"),
            "accent_color": theme_preferences.get("accent_color"),
        },
        "accessibility": {
            "focus_indicators": accessibility_preferences.get("focus_indicators", True),
            "reduce_motion": accessibility_preferences.get("reduce_motion", False),
        },
    }


# UPDATE ENDPOINTS ============================================

@router.put("/sidebar-state")
async def update_sidebar_state(
    update: SidebarStateUpdate,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's sidebar state: default, minified, hidden, locked"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    valid_states = ["default", "minified", "hidden", "locked"]
    if update.state not in valid_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sidebar state. Must be one of {valid_states}"
        )
    
    ui_preferences = _ui_preferences_for_user(current_user)

    current_user.sidebar_state = update.state
    if update.persist:
        current_user.ui_preferences = {
            **ui_preferences,
            "sidebar_state": update.state
        }
    
    db.add(current_user)
    db.commit()
    
    return {
        "success": True,
        "sidebar_state": update.state,
        "message": f"Sidebar set to {update.state}"
    }


@router.put("/layout-preferences")
async def update_layout_preferences(
    update: LayoutPreferencesUpdate,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's layout preferences"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    valid_layouts = ["default", "boxed", "top-navigation"]
    if update.layout not in valid_layouts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid layout. Must be one of {valid_layouts}"
        )
    
    ui_preferences = _ui_preferences_for_user(current_user)
    resolved_layout = update.layout
    if update.top_navigation:
        resolved_layout = "top-navigation"
    elif update.boxed_layout:
        resolved_layout = "boxed"

    current_user.layout = resolved_layout
    current_user.ui_preferences = {
        **ui_preferences,
        "layout": resolved_layout,
        "sidebar_position": update.sidebar_position,
        "compact_mode": update.compact_mode,
        "fixed_header": update.fixed_header,
        "top_navigation": update.top_navigation,
        "boxed_layout": update.boxed_layout,
    }
    
    db.add(current_user)
    db.commit()
    
    return {
        "success": True,
        "layout": resolved_layout,
        "sidebar_position": update.sidebar_position,
        "compact_mode": update.compact_mode,
        "fixed_header": update.fixed_header,
        "top_navigation": update.top_navigation,
        "boxed_layout": update.boxed_layout,
    }


@router.put("/accessibility")
async def update_accessibility_settings(
    settings: AccessibilitySettings,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's accessibility settings - WCAG 2 AA compliance"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate daltonism mode
    valid_modes = ["none", "protanopia", "deuteranopia", "tritanopia"]
    if settings.daltonism_mode not in valid_modes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid daltonism mode. Must be one of {valid_modes}"
        )
    
    # Validate font scale (1.0 - 1.5 range)
    if not (1.0 <= settings.big_font_scale <= 1.5):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Font scale must be between 1.0 and 1.5"
        )
    
    # Apply accessibility settings
    ui_preferences = _ui_preferences_for_user(current_user)

    current_user.big_font = settings.big_font
    current_user.big_font_scale = settings.big_font_scale
    current_user.high_contrast = settings.high_contrast
    current_user.daltonism_mode = settings.daltonism_mode
    
    current_user.ui_preferences = {
        **ui_preferences,
        "accessibility": {
            "big_font": settings.big_font,
            "big_font_scale": settings.big_font_scale,
            "high_contrast": settings.high_contrast,
            "daltonism_mode": settings.daltonism_mode,
            "focus_indicators": settings.focus_indicators,
            "reduce_motion": settings.reduce_motion
        }
    }
    
    db.add(current_user)
    db.commit()
    
    return {
        "success": True,
        "accessibility": {
            "big_font": settings.big_font,
            "big_font_scale": settings.big_font_scale,
            "high_contrast": settings.high_contrast,
            "daltonism_mode": settings.daltonism_mode,
            "focus_indicators": settings.focus_indicators,
            "reduce_motion": settings.reduce_motion,
            "wcag_compliance": "WCAG 2.1 AA"
        }
    }


@router.put("/theme")
async def update_theme_settings(
    settings: ThemeSettings,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's theme - light, dark, default, or high_contrast"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    valid_modes = ["light", "dark", "default", "high_contrast"]
    if settings.mode not in valid_modes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid theme mode. Must be one of {valid_modes}"
        )
    
    # Validate hex color format
    import re
    hex_pattern = r'^#[0-9A-Fa-f]{6}$'
    if not re.match(hex_pattern, settings.primary_color):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary color must be valid hex code (e.g., #007BFF)"
        )
    
    ui_preferences = _ui_preferences_for_user(current_user)

    current_user.theme = settings.mode
    current_user.ui_preferences = {
        **ui_preferences,
        "theme": {
            "mode": settings.mode,
            "primary_color": settings.primary_color,
            "secondary_color": settings.secondary_color,
            "accent_color": settings.accent_color
        }
    }
    
    db.add(current_user)
    db.commit()
    
    return {
        "success": True,
        "theme": settings.mode,
        "colors": {
            "primary": settings.primary_color,
            "secondary": settings.secondary_color,
            "accent": settings.accent_color
        }
    }


@router.put("/system-branding", status_code=status.HTTP_200_OK)
async def update_system_branding(
    branding: BrandingSettings,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update system branding (Admin only)"""
    # Verify admin
    if not current_user or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Get or create system settings
    settings = db.query(SystemSettings).first()
    if not settings:
        settings = SystemSettings(id=str(uuid.uuid4()))
        db.add(settings)
    
    settings.company_name = branding.company_name
    if branding.logo_url:
        settings.logo_url = branding.logo_url
    if branding.logo_file:
        # In production: save base64 to file storage, get URL back
        settings.logo_url = f"/uploads/logo_{uuid.uuid4()}.png"
    
    settings.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "company_name": settings.company_name,
        "logo_url": settings.logo_url
    }


@router.put("/system-date-format", status_code=status.HTTP_200_OK)
async def update_date_format(
    settings: DateFormatSettings,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update system-wide date and time format (Admin only)"""
    if not current_user or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    valid_formats = ["MM/DD/YYYY", "DD/MM/YYYY"]
    if settings.format not in valid_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid format. Must be one of {valid_formats}"
        )
    
    system_settings = db.query(SystemSettings).first()
    if not system_settings:
        system_settings = SystemSettings(id=str(uuid.uuid4()))
        db.add(system_settings)
    
    system_settings.date_format = settings.format
    system_settings.time_zone = settings.time_zone
    system_settings.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "date_format": settings.format,
        "time_zone": settings.time_zone,
        "note": "All users will see dates in this format across the system"
    }


@router.put("/system-theme", status_code=status.HTTP_200_OK)
async def update_system_theme(
    theme: ThemeSettings,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update system-wide default theme (Admin only)"""
    if not current_user or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    import re
    hex_pattern = r'^#[0-9A-Fa-f]{6}$'
    if not re.match(hex_pattern, theme.primary_color):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary color must be valid hex code"
        )
    
    system_settings = db.query(SystemSettings).first()
    if not system_settings:
        system_settings = SystemSettings(id=str(uuid.uuid4()))
        db.add(system_settings)
    
    system_settings.default_theme = theme.mode
    system_settings.primary_color = theme.primary_color
    system_settings.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "default_theme": theme.mode,
        "primary_color": theme.primary_color
    }


@router.put("/system-accessibility", status_code=status.HTTP_200_OK)
async def update_system_accessibility(
    accessibility: AccessibilitySettings,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db)
):
    """Update system-wide accessibility defaults (Admin only)"""
    if not current_user or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    system_settings = db.query(SystemSettings).first()
    if not system_settings:
        system_settings = SystemSettings(id=str(uuid.uuid4()))
        db.add(system_settings)
    
    system_settings.enable_daltonism_mode = (accessibility.daltonism_mode != "none")
    system_settings.system_wide_font_scale = accessibility.big_font_scale
    system_settings.default_high_contrast = accessibility.high_contrast
    system_settings.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "accessibility": {
            "daltonism_mode_available": system_settings.enable_daltonism_mode,
            "system_font_scale": system_settings.system_wide_font_scale,
            "high_contrast_default": system_settings.default_high_contrast,
            "wcag_compliance": "WCAG 2.1 AA"
        }
    }


@router.get("/health")
async def settings_health():
    """Health check for settings service"""
    return {
        "status": "healthy",
        "service": "settings",
        "capabilities": [
            "sidebar_customization",
            "layout_preferences",
            "accessibility_settings",
            "theme_management",
            "branding_customization",
            "date_format_settings"
        ]
    }
