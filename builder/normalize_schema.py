from __future__ import annotations
from typing import Any


def normalize_and_validate(slides_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    slides: list[dict[str, Any]] = []
    for idx, s in enumerate(slides_raw, start=1):
        slides.append(
            {
                "id": s.get("Slide-ID", f"slide-{idx:02d}"),
                "template_id": s.get("Template-ID", "content-standard-01"),
                "slide_title": s.get("Slide-Title", f"Slide {idx}"),
                "voiceover": s.get("Voiceover", ""),
                "audio_vo": s.get("Audio-VO", ""),
                "raw": s,
            }
        )
    return slides
