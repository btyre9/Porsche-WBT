from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path


EXCLUDED_NAMES = {
    ".git",
    ".claude",
    ".tmp",
    "output",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    "sandbox",  # Sandbox stays in the main project only
}


STARTER_STORYBOARD = """# Course: {course_title}

## Slide01
Slide-ID: slide-01
Template-ID: title-intro-01
Slide-Title: {course_title}
Audio-VO: assets/audio/vo/M01_SLD_001.mp3
Voiceover: Welcome to {course_title}.
On-Screen-Text: Welcome to {course_title}.
Animation-Intro: FadeIn

## Slide02
Slide-ID: slide-02
Template-ID: content-standard-01
Slide-Title: Topic Overview
Audio-VO: assets/audio/vo/M01_SLD_002.mp3
Voiceover: This slide introduces the module topic.
Caption-Text: This slide introduces the module topic.
On-Screen-Text: Replace with final on-screen text.
Animation-Intro: SlideUp

## Slide03
Slide-ID: slide-03
Template-ID: kc-mcq-01
Slide-Title: Knowledge Check
Audio-VO: assets/audio/vo/M01_SLD_003.mp3
Voiceover: Select the best answer.
On-Screen-Text: Choose one answer, then submit.
Animation-Intro: ScaleIn
Interaction-Type: mcq
Question: Example question text?
Choice-1: Example answer A
Choice-2: Example answer B
Choice-3: Example answer C
Choice-4: Example answer D
Correct-Answer: Example answer A
Quiz-Group: knowledge
"""


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "new-course-module"


def ignore_copy(_src: str, names: list[str]) -> set[str]:
    ignored = set()
    for name in names:
        if name in EXCLUDED_NAMES:
            ignored.add(name)
            continue
        if name.endswith(".pyc"):
            ignored.add(name)
    return ignored


def remove_children(path: Path) -> None:
    if not path.exists():
        return
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def write_starter_storyboard(destination_root: Path, course_title: str) -> None:
    storyboard_path = destination_root / "storyboard" / "course.md"
    storyboard_path.parent.mkdir(parents=True, exist_ok=True)
    storyboard_path.write_text(
        STARTER_STORYBOARD.format(course_title=course_title),
        encoding="utf-8",
    )


def update_build_config(destination_root: Path, course_title: str, course_id: str) -> None:
    cfg_path = destination_root / "config" / "build.config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg.setdefault("course", {})
    cfg["course"]["title"] = course_title
    cfg["course"]["id"] = course_id
    cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def clean_slide_content(destination_root: Path) -> None:
    remove_children(destination_root / "assets" / "audio" / "vo")
    remove_children(destination_root / "assets" / "images")
    remove_children(destination_root / "assets" / "animation-cues")
    remove_children(destination_root / "assets" / "interaction-audio")
    remove_children(destination_root / "templates" / "slides" / "prebuilt")
    remove_children(destination_root / "output" / "course")


def run(source_root: Path, destination: Path, course_title: str, course_id: str) -> None:
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")

    shutil.copytree(source_root, destination, ignore=ignore_copy)
    write_starter_storyboard(destination, course_title)
    update_build_config(destination, course_title, course_id)
    clean_slide_content(destination)

    print("Module starter created:")
    print(f"  Path: {destination}")
    print(f"  Course title: {course_title}")
    print(f"  Course ID: {course_id}")
    print()
    print("Cleared folders (ready for new content):")
    print("  - assets/audio/vo/")
    print("  - assets/images/")
    print("  - assets/animation-cues/")
    print("  - templates/slides/prebuilt/")
    print()
    print("Next steps:")
    print("  1. Design slides in the sandbox (main project)")
    print("  2. Copy finished slides to templates/slides/prebuilt/")
    print("  3. Add audio to assets/audio/vo/")
    print("  4. Edit storyboard/course.md")
    print("  5. Run: python builder/main.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create a clean new-module starter from this project."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Existing project root to copy from.",
    )
    parser.add_argument(
        "--destination",
        type=Path,
        required=True,
        help="Path for the new module folder.",
    )
    parser.add_argument(
        "--course-title",
        required=True,
        help="Course title for build config and starter storyboard.",
    )
    parser.add_argument(
        "--course-id",
        default="",
        help="Course id in build config. If omitted, a slug is generated from title.",
    )
    args = parser.parse_args()

    run(
        source_root=args.source_root.resolve(),
        destination=args.destination.resolve(),
        course_title=args.course_title.strip(),
        course_id=(args.course_id.strip() or slugify(args.course_title)),
    )
