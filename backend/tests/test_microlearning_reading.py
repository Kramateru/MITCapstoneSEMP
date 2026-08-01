from backend.services.microlearning_catalog import (
    SUPPORTED_MICROLEARNING_TYPES,
    build_type_specific_exercises,
    normalize_module_type,
)


def test_reading_module_is_supported_and_generates_stt_exercise():
    assert "reading" in SUPPORTED_MICROLEARNING_TYPES
    assert normalize_module_type("reading") == "reading"

    exercises = build_type_specific_exercises(
        "reading",
        {
            "reading_passage": "Please acknowledge the concern and explain the next step.",
            "practice_prompt": "Read the passage aloud and explain the next step.",
            "required_keywords": ["concern", "next step"],
            "sample_answer": "I understand your concern and I will explain the next step.",
        },
        title="Reading Practice",
        skill_focus="Speech delivery",
    )

    assert len(exercises) == 1
    exercise = exercises[0]
    assert exercise["type"] == "keyword_response"
    assert exercise["enable_stt"] is True
    assert exercise["prompt"] == "Read the assigned passage aloud."
    assert exercise["required_keywords"] == []
    assert exercise["sample_answer"] == "Please acknowledge the concern and explain the next step."
