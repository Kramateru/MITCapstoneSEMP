from types import SimpleNamespace

from backend.routes.analytics_routes import _summarize_session_collection


def test_summarize_session_collection_aggregates_scores_and_passes():
    sessions = [
        SimpleNamespace(overall_score=80.0),
        SimpleNamespace(overall_score=60.0),
        SimpleNamespace(overall_score=None),
    ]

    summary = _summarize_session_collection(sessions)

    assert summary["total_sessions"] == 3
    assert summary["sessions_passed"] == 1
    assert summary["current_average_score"] == 70.0
    assert summary["latest_session_score"] == 80.0
