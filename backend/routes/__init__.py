"""
API Routes Package
"""

from .admin_routes import router as admin_router
from .auth_routes import router as auth_router
from .trainee_routes import router as trainee_router
from .trainer_routes import router as trainer_router
from .settings_routes import router as settings_router
from .workspace_routes import router as workspace_router
from .export_routes import router as export_router
from .certification_routes import router as certification_router

__all__ = [
    "auth_router",
    "admin_router",
    "trainer_router", 
    "trainee_router",
    "settings_router",
    "workspace_router",
    "export_router",
    "certification_router",
]
