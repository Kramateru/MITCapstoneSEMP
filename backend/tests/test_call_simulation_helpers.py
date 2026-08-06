from backend.routes import call_simulation_routes


def test_count_turn_attempts_for_step_counts_matching_step_only():
    turn_logs = [
        {"step_number": 1, "turn_attempt_number": 1},
        {"step_number": 2, "turn_attempt_number": 1},
        {"step_number": 1, "turn_attempt_number": 2},
        {"step_number": 1, "turn_attempt_number": 3},
    ]

    assert call_simulation_routes._count_turn_attempts_for_step(turn_logs, 1) == 3
    assert call_simulation_routes._count_turn_attempts_for_step(turn_logs, 2) == 1
    assert call_simulation_routes._count_turn_attempts_for_step(turn_logs, 99) == 0


def test_select_latest_csr_attempt_prefers_last_accepted_attempt():
    attempts = [
        {"accepted_for_progress": False, "turn_attempt_number": 1},
        {"accepted_for_progress": True, "turn_attempt_number": 2},
        {"accepted_for_progress": False, "turn_attempt_number": 3},
    ]

    selected = call_simulation_routes._select_latest_csr_attempt(attempts)

    assert selected["turn_attempt_number"] == 2
