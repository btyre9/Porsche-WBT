from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any


KV_RE = re.compile(r"^([^:]+):\s*(.*)$")
SLIDE_HEADING_RE = re.compile(r"^(?:#+\s*)?(slide|screen|scene)\s*[-_ ]*\d+", re.IGNORECASE)


def _canonical_key(raw_key: str) -> str:
    raw = raw_key.strip()
    compact = re.sub(r"[\s_-]+", "", raw).lower()

    direct = {
        "slideid": "Slide-ID",
        "templateid": "Template-ID",
        "template": "Template-ID",
        "slidetitle": "Slide-Title",
        "title": "Slide-Title",
        "audiovo": "Audio-VO",
        "audio": "Audio-VO",
        "voiceover": "Voiceover",
        "vo": "Voiceover",
        "script": "Voiceover",
        "narration": "Voiceover",
        "captiontext": "Caption-Text",
        "onscreentext": "On-Screen-Text",
        "animationintro": "Animation-Intro",
        "interactiontype": "Interaction-Type",
        "question": "Question",
        "correctanswer": "Correct-Answer",
        "quizgroup": "Quiz-Group",
        "subtitle": "Subtitle",
        "image": "Image",
    }
    if compact in direct:
        return direct[compact]

    m_choice = re.match(r"^choice(\d+)$", compact)
    if m_choice:
        return f"Choice-{m_choice.group(1)}"

    m_objective = re.match(r"^objective(\d+)$", compact)
    if m_objective:
        return f"Objective-{m_objective.group(1)}"

    m_anim_element = re.match(r"^animationelement(.+)$", compact)
    if m_anim_element:
        suffix = m_anim_element.group(1).strip()
        return f"Animation-Element-{suffix}" if suffix else "Animation-Element-1"

    return raw.replace(" ", "-")


def _looks_like_slide_heading(text: str, style_name: str) -> bool:
    if SLIDE_HEADING_RE.match(text):
        return True
    if style_name.lower().startswith("heading") and text.lower().startswith("slide"):
        return True
    return False


def _append_value(slide: dict[str, Any], key: str, value: str) -> None:
    existing = slide.get(key, "")
    if existing:
        slide[key] = f"{existing} {value}".strip()
    else:
        slide[key] = value.strip()


def _iter_doc_lines(doc: Any) -> list[tuple[str, str]]:
    lines: list[tuple[str, str]] = []

    for para in doc.paragraphs:
        text = (para.text or "").strip()
        if not text:
            continue
        style_name = para.style.name if para.style else ""
        for line in text.splitlines():
            clean = line.strip()
            if clean:
                lines.append((clean, style_name))

    for table in doc.tables:
        for row in table.rows:
            cells = [(cell.text or "").strip() for cell in row.cells]
            cells = [c for c in cells if c]
            if not cells:
                continue

            if len(cells) >= 2:
                key_cell = cells[0]
                value_cell = " ".join(cells[1:]).strip()
                if key_cell.lower().startswith("slide") and not value_cell:
                    lines.append((key_cell, "Table"))
                    continue

                if ":" in key_cell:
                    combined = f"{key_cell} {value_cell}".strip()
                else:
                    combined = f"{key_cell}: {value_cell}".strip()
                lines.append((combined, "Table"))
                continue

            only = cells[0]
            for line in only.splitlines():
                clean = line.strip()
                if clean:
                    lines.append((clean, "Table"))

    return lines


def _extract_slides_from_docx(docx_path: Path) -> tuple[str, list[dict[str, Any]]]:
    try:
        from docx import Document
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "python-docx is required. Install it with: python -m pip install python-docx"
        ) from exc

    doc = Document(str(docx_path))
    course_title = ""
    slides: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    last_key: str | None = None

    def flush_current() -> None:
        nonlocal current, last_key
        if current and any(k for k in current.keys() if k != "section_heading"):
            slides.append(current)
        current = None
        last_key = None

    for line, style_name in _iter_doc_lines(doc):
        if line.lower().startswith("# course:"):
            course_title = line.split(":", 1)[1].strip()
            continue
        if line.lower().startswith("course:") and not course_title:
            course_title = line.split(":", 1)[1].strip()
            continue

        heading_text = line[2:].strip() if line.startswith("##") else line
        if _looks_like_slide_heading(heading_text, style_name):
            flush_current()
            current = {"section_heading": heading_text}
            continue

        m = KV_RE.match(line)
        if m:
            key = _canonical_key(m.group(1))
            value = m.group(2).strip()
            if key == "Slide-ID" and current and "Slide-ID" in current:
                flush_current()
                current = {"section_heading": f"Slide{len(slides) + 1:02d}"}

            if current is None:
                current = {"section_heading": f"Slide{len(slides) + 1:02d}"}
            current[key] = value
            last_key = key
            continue

        if current is None:
            continue
        if last_key:
            _append_value(current, last_key, line)

    flush_current()

    if not course_title:
        course_title = docx_path.stem.replace("-", " ").strip()

    for idx, slide in enumerate(slides, start=1):
        slide.setdefault("Slide-ID", f"slide-{idx:02d}")
        slide.setdefault("Template-ID", "content-standard-01")
        slide.setdefault("Slide-Title", slide.get("section_heading", f"Slide {idx}"))

    return course_title, slides


def _order_slide_keys(slide: dict[str, Any]) -> list[str]:
    preferred = [
        "Slide-ID",
        "Template-ID",
        "Slide-Title",
        "Audio-VO",
        "Voiceover",
        "Caption-Text",
        "On-Screen-Text",
        "Animation-Intro",
        "Interaction-Type",
        "Question",
        "Correct-Answer",
        "Quiz-Group",
    ]

    keys = [k for k in slide.keys() if k != "section_heading"]
    keys_sorted: list[str] = []

    for key in preferred:
        if key in keys:
            keys_sorted.append(key)

    choice_keys = sorted(
        [k for k in keys if re.match(r"^Choice-\d+$", k)],
        key=lambda x: int(x.split("-")[1]),
    )
    keys_sorted.extend(choice_keys)

    objective_keys = sorted(
        [k for k in keys if re.match(r"^Objective-\d+$", k)],
        key=lambda x: int(x.split("-")[1]),
    )
    keys_sorted.extend(objective_keys)

    anim_element_keys = sorted(
        [k for k in keys if k.startswith("Animation-Element-")]
    )
    keys_sorted.extend(anim_element_keys)

    for key in keys:
        if key not in keys_sorted:
            keys_sorted.append(key)

    return keys_sorted


def _render_markdown(course_title: str, slides: list[dict[str, Any]]) -> str:
    out: list[str] = [f"# Course: {course_title}", ""]

    for idx, slide in enumerate(slides, start=1):
        section_heading = slide.get("section_heading", f"Slide{idx:02d}")
        out.append(f"## {section_heading}")
        for key in _order_slide_keys(slide):
            out.append(f"{key}: {slide.get(key, '')}")
        out.append("")

    return "\n".join(out).rstrip() + "\n"


def run(docx_path: Path, output_markdown: Path) -> None:
    if not docx_path.exists():
        raise FileNotFoundError(f"Word storyboard not found: {docx_path}")

    course_title, slides = _extract_slides_from_docx(docx_path)
    if not slides:
        raise ValueError(
            "No slides found in Word document. "
            "Use slide headings like 'Slide01' and key/value lines like 'Slide-Title: ...'."
        )

    markdown = _render_markdown(course_title, slides)
    output_markdown.parent.mkdir(parents=True, exist_ok=True)
    output_markdown.write_text(markdown, encoding="utf-8")

    print(f"Imported Word storyboard: {docx_path}")
    print(f"Wrote markdown storyboard: {output_markdown}")
    print(f"Slides imported: {len(slides)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Convert a Word storyboard (.docx) to storyboard/course.md format."
    )
    parser.add_argument(
        "--docx",
        type=Path,
        required=True,
        help="Path to source storyboard .docx file.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("storyboard/course.md"),
        help="Output markdown path (default: storyboard/course.md).",
    )
    args = parser.parse_args()
    run(args.docx.resolve(), args.output.resolve())
