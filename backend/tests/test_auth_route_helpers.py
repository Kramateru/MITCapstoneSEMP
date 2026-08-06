from backend.models import User, UserRole
from backend.routes.auth_routes import _build_login_batch_context


class _BatchStub:
    def __init__(self, *, batch_id, name, wave_number, is_active=True):
        self.id = batch_id
        self.name = name
        self.wave_number = wave_number
        self.is_active = is_active


def test_build_login_batch_context_prefers_active_batch_without_sorting():
    user = User(
        id="user-1",
        email="user@example.com",
        full_name="Test User",
        password_hash="hashed",
        role=UserRole.TRAINEE,
        is_active=True,
    )
    user.__dict__["batches"] = [
        _BatchStub(batch_id="batch-2", name="Zulu", wave_number=3, is_active=False),
        _BatchStub(batch_id="batch-1", name="Alpha", wave_number=1, is_active=True),
        _BatchStub(batch_id="batch-3", name="Beta", wave_number=2, is_active=True),
    ]

    context = _build_login_batch_context(user)

    assert context["batch_id"] == "batch-1"
    assert context["batch_name"] == "Alpha"
    assert context["wave_number"] == 1
