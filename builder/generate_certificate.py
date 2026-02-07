from __future__ import annotations
from pathlib import Path


def write_certificate_placeholder(output_path: Path, learner_name: str, course_title: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        f"Certificate\\nLearner: {learner_name}\\nCourse: {course_title}\\n",
        encoding="utf-8",
    )
