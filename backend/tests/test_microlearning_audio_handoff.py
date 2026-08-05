from types import SimpleNamespace

from backend.services.microlearning import serialize_assignment_detail, serialize_microlearning_module


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
