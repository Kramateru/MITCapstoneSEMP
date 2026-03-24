"""
Scenario Branching Engine - Executes scenario flows with conditional branching
Handles parent-child relationships, conditional logic, and multi-path scenarios
"""

from enum import Enum
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import uuid


class ConditionType(str, Enum):
    """Types of conditions for branching"""
    SCORE_ABOVE = "score_above"        # If score > threshold
    SCORE_BELOW = "score_below"        # If score < threshold
    KEYWORD_PRESENT = "keyword_present"  # If keyword found in response
    KEYWORD_MISSING = "keyword_missing"  # If keyword not found
    TIME_TAKEN = "time_taken"          # If time taken exceeds threshold
    ATTEMPT_NUMBER = "attempt_number"  # If nth attempt
    USER_CHOICE = "user_choice"        # Manual branching by user
    NONE = "none"                      # No branching (linear)


@dataclass
class BranchingDecision:
    """Represents a branching decision point in a scenario"""
    condition_type: ConditionType
    condition_value: Any  # e.g., score threshold, keyword, time limit
    true_branch_step: int  # Next step if condition is true
    false_branch_step: Optional[int] = None  # Next step if condition is false (optional)
    description: str = ""


@dataclass
class ScenarioStep:
    """A single step in a scenario"""
    step_number: int
    step_type: str  # "prompt", "response", "feedback", "decision", "branching_point"
    content: str  # The actual prompt/feedback text
    
    # For response steps
    expected_keywords: Optional[List[str]] = None
    min_words: Optional[int] = None
    max_words: Optional[int] = None
    
    # For branching
    branching_logic: Optional[BranchingDecision] = None
    
    # Scoring
    score_weight: float = 1.0  # How much this step contributes to overall score
    
    # Metadata
    estimated_duration: int = 30  # Seconds
    difficulty: str = "medium"  # easy, medium, hard
    
    # Optional hint system
    buddy_bot_hint: Optional[str] = None


@dataclass
class ScenarioFlowResult:
    """Result of executing a scenario flow"""
    completed: bool
    total_steps: int
    steps_completed: int
    path_taken: List[int]  # Which steps were executed (due to branching)
    scores_by_step: Dict[int, float]
    overall_score: float
    branching_decisions: List[Dict[str, Any]]
    total_time: int  # Seconds
    passed: bool


class ScenarioBranchingEngine:
    """
    Core engine for executing scenarios with branching logic
    """
    
    def __init__(self):
        self.current_step = 0
        self.step_scores = {}
        self.path_taken = []
        self.branching_decisions = []
        self.total_time = 0
        self.current_attempt = 1
    
    def load_scenario(self, scenario_id: str, steps: List[ScenarioStep]):
        """Load a scenario with its steps"""
        self.scenario_id = scenario_id
        self.steps = {step.step_number: step for step in steps}
        self.total_steps = len(steps)
        self.current_step = 1
        self.step_scores = {}
        self.path_taken = []
        self.branching_decisions = []
    
    def execute_step(
        self,
        step_number: int,
        user_response: Optional[str] = None,
        response_score: Optional[float] = None,
        response_time: int = 0
    ) -> BranchingDecision:
        """
        Execute a single step and determine next step based on branching logic
        
        Returns: Next step number to execute, or None if scenario complete
        """
        
        if step_number not in self.steps:
            raise ValueError(f"Step {step_number} not found in scenario")
        
        step = self.steps[step_number]
        self.path_taken.append(step_number)
        
        # Record score for this step
        if response_score is not None:
            self.step_scores[step_number] = response_score
        
        # Update total time
        self.total_time += response_time
        
        # Evaluate branching logic
        if step.branching_logic:
            next_step = self._evaluate_branch(
                step.branching_logic,
                user_response,
                response_score,
                response_time
            )
            
            # Record the decision
            self.branching_decisions.append({
                "from_step": step_number,
                "condition": step.branching_logic.condition_type.value,
                "condition_value": step.branching_logic.condition_value,
                "to_step": next_step,
                "user_response": user_response,
                "response_score": response_score
            })
            
            return next_step
        
        # No branching, go to next step
        return step_number + 1 if step_number < self.total_steps else None
    
    def _evaluate_branch(
        self,
        decision: BranchingDecision,
        user_response: Optional[str],
        response_score: Optional[float],
        response_time: int
    ) -> int:
        """
        Evaluate a single branching condition
        Returns: The next step number to execute
        """
        
        condition_met = False
        
        if decision.condition_type == ConditionType.SCORE_ABOVE:
            condition_met = response_score is not None and response_score > decision.condition_value
        
        elif decision.condition_type == ConditionType.SCORE_BELOW:
            condition_met = response_score is not None and response_score < decision.condition_value
        
        elif decision.condition_type == ConditionType.KEYWORD_PRESENT:
            condition_met = user_response and decision.condition_value.lower() in user_response.lower()
        
        elif decision.condition_type == ConditionType.KEYWORD_MISSING:
            condition_met = user_response and decision.condition_value.lower() not in user_response.lower()
        
        elif decision.condition_type == ConditionType.TIME_TAKEN:
            # condition_value is max seconds allowed
            condition_met = response_time > decision.condition_value
        
        elif decision.condition_type == ConditionType.ATTEMPT_NUMBER:
            condition_met = self.current_attempt >= decision.condition_value
        
        elif decision.condition_type == ConditionType.USER_CHOICE:
            # For manual choices, response_score is treated as 1=true, 0=false
            condition_met = response_score == 1
        
        # Return appropriate next step
        if condition_met:
            return decision.true_branch_step
        else:
            return decision.false_branch_step if decision.false_branch_step else (
                decision.true_branch_step if not decision.false_branch_step else None
            )
    
    def calculate_overall_score(self, min_passing_score: float = 70.0) -> ScenarioFlowResult:
        """
        Calculate overall scenario performance
        """
        if not self.step_scores:
            overall_score = 0.0
        else:
            # Weight scores by step weight
            total_weight = sum(
                self.steps[step_num].score_weight
                for step_num in self.step_scores.keys()
                if step_num in self.steps
            )
            
            weighted_sum = sum(
                self.step_scores[step_num] * self.steps[step_num].score_weight
                for step_num in self.step_scores.keys()
                if step_num in self.steps
            )
            
            overall_score = (weighted_sum / total_weight * 100) if total_weight > 0 else 0
        
        return ScenarioFlowResult(
            completed=len(self.path_taken) >= max(1, self.total_steps - 2),  # Allow skipping some branches
            total_steps=self.total_steps,
            steps_completed=len(self.path_taken),
            path_taken=self.path_taken,
            scores_by_step=self.step_scores,
            overall_score=min(100, max(0, overall_score)),
            branching_decisions=self.branching_decisions,
            total_time=self.total_time,
            passed=overall_score >= min_passing_score
        )
    
    def suggest_next_step(self) -> Optional[ScenarioStep]:
        """Get the next step in sequence (for linear progression)"""
        next_num = (self.path_taken[-1] if self.path_taken else 0) + 1
        return self.steps.get(next_num)
    
    def get_available_branches(self, current_step: int) -> List[Dict]:
        """Get all possible branches from current step"""
        step = self.steps.get(current_step)
        if not step or not step.branching_logic:
            return []
        
        return [
            {
                "condition": step.branching_logic.condition_type.value,
                "true_path": step.branching_logic.true_branch_step,
                "false_path": step.branching_logic.false_branch_step,
                "description": step.branching_logic.description
            }
        ]
    
    def get_scenario_statistics(self) -> Dict[str, Any]:
        """Get statistics about the scenario structure"""
        
        # Find max depth (longest path through branches)
        def find_depth(step_num: int, visited=None) -> int:
            if visited is None:
                visited = set()
            if step_num in visited or step_num not in self.steps:
                return 0
            visited.add(step_num)
            
            step = self.steps[step_num]
            if not step.branching_logic:
                return 1
            
            true_depth = find_depth(step.branching_logic.true_branch_step, visited.copy())
            false_depth = find_depth(step.branching_logic.false_branch_step or (step_num + 1), visited.copy())
            
            return 1 + max(true_depth, false_depth)
        
        max_depth = find_depth(1)
        num_branches = sum(1 for step in self.steps.values() if step.branching_logic)
        
        return {
            "total_steps": self.total_steps,
            "branching_points": num_branches,
            "max_path_depth": max_depth,
            "is_linear": num_branches == 0,
            "complexity": "simple" if num_branches <= 2 else "moderate" if num_branches <= 5 else "complex",
            "estimated_duration_min": sum(step.estimated_duration for step in self.steps.values()) // 60,
            "estimated_duration_sec": sum(step.estimated_duration for step in self.steps.values())
        }


# Request/Response Models for API

class StepExecutionRequest(BaseModel):
    step_number: int
    user_response: Optional[str] = None
    response_score: Optional[float] = None
    response_time: int = 0


class BranchingDecisionResponse(BaseModel):
    next_step: Optional[int]
    condition_met: bool
    description: str


class ScenarioStatisticsResponse(BaseModel):
    total_steps: int
    branching_points: int
    max_path_depth: int
    is_linear: bool
    complexity: str
    estimated_duration_sec: int
    possible_paths: int  # 2^N for N branches (theoretical max)
