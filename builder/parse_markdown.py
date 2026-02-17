from __future__ import annotations
from pathlib import Path
import re
from typing import Any


KV_RE = re.compile(r"^([A-Za-z0-9_-]+):\s*(.*)$")


def parse_storyboard_markdown(markdown_path: Path) -> list[dict[str, Any]]:
    text = markdown_path.read_text(encoding="utf-8")
    blocks = re.split(r"^##\s+.+$", text, flags=re.MULTILINE)
    headers = re.findall(r"^##\s+(.+)$", text, flags=re.MULTILINE)

    slides: list[dict[str, Any]] = []
    for i, body in enumerate(blocks[1:]):
        slide: dict[str, Any] = {"section_heading": headers[i].strip()}
        for line in body.splitlines():
            m = KV_RE.match(line.strip())
            if not m:
                continue
            key, value = m.group(1), m.group(2).strip()
            slide[key] = value

        if slide:
            slide.setdefault("Slide-ID", f"slide-{i+1:02d}")
            slide.setdefault("Template-ID", "content-standard-01")
            slide.setdefault("Slide-Title", slide.get("section_heading", f"Slide {i+1}"))
            slides.append(slide)

    return slides
