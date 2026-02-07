from __future__ import annotations


def score_quiz(correct: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((correct / total) * 100, 2)


def passed(score: float, threshold: int = 80) -> bool:
    return score >= threshold
