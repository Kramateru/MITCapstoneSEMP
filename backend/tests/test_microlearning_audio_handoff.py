from types import SimpleNamespace

from backend.routes.microlearning_routes import _resolve_audio_media_type
from backend.services.microlearning import serialize_assignment_detail, serialize_microlearning_module
from backend.supabase_client import SupabaseClient


def test_microlearning_module_serialization_exposes_audio_from_content_data():
    module = SimpleNamespace(
        id="module-1",
        title="Audio lesson",
        description="",
        category="Audio",
        type="audio",
        duration_minutes=5,
        passing_score=80,
        skill_focus="Speaking",
        content_url=None,
        content_data={"audio_url": "https://cdn.example.com/lesson.mp3"},
        audio_url=None,
        audio_transcript="",
        audio_tts_url=None,
        audio_duration_seconds=12,
        audio_language="en-US",
        difficulty=None,
        topic_category_id=None,
        topic_category=None,
        assessment_method_id=None,
        assessment_method=None,
        exercises=[],
        created_at=None,
        is_active=True,
    )

    payload = serialize_microlearning_module(module)

    assert payload["content_url"] == "https://cdn.example.com/lesson.mp3"
    assert payload["audio_url"] == "https://cdn.example.com/lesson.mp3"


def test_assignment_detail_serialization_exposes_audio_from_content_data():
    module = SimpleNamespace(
        id="module-2",
        title="Audio lesson",
        description="",
        category="Audio",
        type="audio",
        duration_minutes=5,
        passing_score=80,
        skill_focus="Speaking",
        content_url=None,
        content_data={"audio_url": "https://cdn.example.com/lesson.mp3"},
        audio_url=None,
        audio_transcript="",
        audio_tts_url=None,
        audio_duration_seconds=12,
        audio_language="en-US",
        difficulty=None,
        topic_category_id=None,
        topic_category=None,
        assessment_method_id=None,
        assessment_method=None,
        exercises=[],
        created_at=None,
        is_active=True,
    )
    assignment = SimpleNamespace(
        id="assignment-1",
        module=module,
        module_id="module-2",
        trainee_id="trainee-1",
        batch_id=None,
        batch=None,
        trainee=None,
        trainer=None,
        certificate=None,
        responses={},
        completed_exercises=0,
        completion_percentage=0.0,
        status="assigned",
        assigned_at=None,
        updated_at=None,
        completed_at=None,
        started_at=None,
        due_date=None,
        notes=None,
        is_mandatory=False,
        certificate_id=None,
        assignment_count=0,
        assigned_by=None,
    )

    payload = serialize_assignment_detail(assignment)

    assert payload["module"]["content_url"] == "https://cdn.example.com/lesson.mp3"
    assert payload["module"]["audio_url"] == "https://cdn.example.com/lesson.mp3"


def test_microlearning_tts_upload_preserves_mp3_extension_and_content_type(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("ALLOW_LOCAL_MEDIA_FALLBACK", "true")
    monkeypatch.setenv("BACKEND_URL", "http://127.0.0.1:8001")

    client = SupabaseClient()
    client.is_available = False

    url = client.upload_microlearning_tts(
        audio_data=b"fake mp3 bytes",
        module_id="module-tts",
        audio_format="mp3",
        content_type="audio/mpeg",
    )

    assert url is not None
    assert "/media/microlearning/audio/module-tts/tts/tts_" in url
    assert url.endswith(".mp3")
    assert (tmp_path / "media" / "microlearning" / "audio" / "module-tts" / "tts").exists()


def test_tts_stream_media_type_uses_saved_mp3_metadata():
    module = SimpleNamespace(content_data={"tts_content_type": "audio/mpeg"})

    assert _resolve_audio_media_type(
        module,
        use_tts=True,
        asset_url="https://cdn.example.com/lesson-tts.mp3",
    ) == "audio/mpeg"
