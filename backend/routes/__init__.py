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
from .call_simulation_routes import router as call_simulation_router

# Backward-compatible alias for older imports that still reference the
# former trainee-only Call Simulation router name.
call_simulation_trainee_router = call_simulation_router

__all__ = [
    "auth_router",
    "admin_router",
    "trainer_router", 
    "trainee_router",
    "settings_router",
    "workspace_router",
    "export_router",
    "certification_router",
    "call_simulation_router",
    "call_simulation_trainee_router",
]
