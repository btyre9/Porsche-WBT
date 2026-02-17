from __future__ import annotations
from typing import Any


def _extract_element_animations(raw: dict[str, Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for key, value in raw.items():
        if not key.startswith("Animation-Element-"):
            continue
        target = key.replace("Animation-Element-", "", 1).strip()
        preset = str(value or "").strip()
        if not target or not preset:
            continue
        out.append({"target": target, "preset": preset})
    return out


def normalize_and_validate(slides_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    slides: list[dict[str, Any]] = []
    for idx, s in enumerate(slides_raw, start=1):
        slides.append(
            {
                "id": s.get("Slide-ID", f"slide-{idx:02d}"),
                "template_id": s.get("Template-ID", "content-standard-01"),
                "slide_title": s.get("Slide-Title", f"Slide {idx}"),
                "voiceover": s.get("Voiceover", ""),
                "caption_text": s.get("Caption-Text", ""),
                "on_screen_text": s.get("On-Screen-Text", ""),
                "audio_vo": s.get("Audio-VO", ""),
                "intro_animation": s.get("Animation-Intro", ""),
                "element_animations": _extract_element_animations(s),
                "raw": s,
            }
        )
    return slides
