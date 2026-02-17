from __future__ import annotations
from pathlib import Path
import argparse
import html
import json
import re
import shutil

from parse_markdown import parse_storyboard_markdown
from normalize_schema import normalize_and_validate
from export_tts_script import apply_pronunciation_map, export_tts_csv
from generate_vtt import transcribe_to_vtt, write_text_vtt
from build_player import build_player_index
from build_scorm_manifest import write_scorm_manifest

TITLE_RE = re.compile(r"<title>(.*?)</title>", flags=re.IGNORECASE | re.DOTALL)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _extract_choices(raw: dict) -> list[str]:
    return [v for k, v in raw.items() if k.startswith("Choice-") and v]


def _copy_assets(project_root: Path, output_root: Path) -> None:
    src_assets = project_root / "assets"
    if not src_assets.exists():
        return

    dst_assets = output_root / "assets"
    for src in src_assets.rglob("*"):
        if not src.is_file():
            continue
        rel = src.relative_to(src_assets)
        dst = dst_assets / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def _sanitize_missing_sfx(course_data: dict, project_root: Path) -> list[str]:
    missing: list[str] = []
    runtime = course_data.get("quiz", {}).get("runtime", {})
    sfx = runtime.get("sfx")
    if not isinstance(sfx, dict):
        return missing

    for key in ("correct", "incorrect"):
        rel = sfx.get(key)
        if not rel:
            continue
        if not (project_root / rel).exists():
            missing.append(rel)
            sfx.pop(key, None)

    if not sfx:
        runtime.pop("sfx", None)

    return missing


def _apply_animation_defaults(slides: list[dict], animation_cfg: dict) -> None:
    default_name = str(animation_cfg.get("default") or "FadeIn")
    presets = animation_cfg.get("presets", {})
    if default_name not in presets and presets:
        default_name = next(iter(presets.keys()))

    for s in slides:
        name = str(s.get("intro_animation") or "").strip() or default_name
        if presets and name not in presets:
            print(
                f"Warning: slide '{s.get('id')}' references unknown Animation-Intro '{name}'. "
                f"Using '{default_name}'."
            )
            name = default_name
        s["intro_animation"] = name
        s["intro_animation_def"] = presets.get(name, {})


def _natural_sort_key(value: str) -> list[object]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def _extract_html_title(html_path: Path) -> str:
    try:
        text = html_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    match = TITLE_RE.search(text)
    if not match:
        return ""
    return html.unescape(" ".join(match.group(1).split())).strip()


def _load_prebuilt_slides(
    prebuilt_dir: Path,
    storyboard_slides: list[dict],
) -> tuple[list[dict], dict[str, Path]]:
    storyboard_by_id = {s["id"]: s for s in storyboard_slides}
    prebuilt_files = []
    for html_file in prebuilt_dir.glob("slide-*.html"):
        # Ignore scratch variants; only include canonical slide files in navigation.
        if html_file.stem.lower().endswith("_make-converted"):
            continue
        prebuilt_files.append(html_file)
    prebuilt_files.sort(key=lambda p: _natural_sort_key(p.name))

    slides: list[dict] = []
    source_by_id: dict[str, Path] = {}

    for html_file in prebuilt_files:
        slide_id = html_file.stem
        source_by_id[slide_id] = html_file

        if slide_id in storyboard_by_id:
            slides.append(dict(storyboard_by_id[slide_id]))
            continue

        title = _extract_html_title(html_file) or slide_id
        slides.append(
            {
                "id": slide_id,
                "template_id": "prebuilt-static",
                "slide_title": title,
                "voiceover": "",
                "caption_text": title,
                "on_screen_text": "",
                "audio_vo": "",
                "intro_animation": "",
                "element_animations": [],
                "raw": {},
            }
        )

    return slides, source_by_id


def _prune_stale_outputs(
    slides: list[dict],
    slides_output: Path,
    captions_output: Path,
    prune_captions: bool = True,
) -> tuple[int, int]:
    expected_slide_files = {f"{s['id']}.html" for s in slides}
    expected_caption_files = {f"{s['id']}.vtt" for s in slides}

    removed_slides = 0
    removed_captions = 0

    if slides_output.exists():
        for html in slides_output.glob("*.html"):
            if html.name not in expected_slide_files:
                html.unlink()
                removed_slides += 1

    if prune_captions and captions_output.exists():
        for vtt in captions_output.glob("*.vtt"):
            if vtt.name not in expected_caption_files:
                vtt.unlink()
                removed_captions += 1

    return removed_slides, removed_captions


def build_quiz_schema(slides: list[dict], pass_threshold: int) -> dict:
    knowledge_checks = []
    final_questions = []

    for s in slides:
        raw = s.get("raw", {})
        interaction = raw.get("Interaction-Type", "").strip().lower()
        question = raw.get("Question", "").strip()
        group = raw.get("Quiz-Group", "knowledge").strip().lower()
        answer = raw.get("Correct-Answer", "").strip()

        if not interaction or not question:
            continue

        item = {
            "slide_id": s["id"],
            "type": interaction,
            "question": question,
            "choices": _extract_choices(raw),
            "correct_answer": answer,
            "shuffle_answers": True
        }

        if group == "final":
            final_questions.append(item)
        else:
            knowledge_checks.append(item)

    return {
        "runtime": {
            "immediate_feedback_types": ["mcq", "tf", "fill-in-blank", "matching", "scenario"],
            "sfx": {
                "correct": "assets/audio/sfx/correct.mp3",
                "incorrect": "assets/audio/sfx/incorrect.mp3"
            },
            "scorm_report_enabled": True
        },
        "knowledge_checks": knowledge_checks,
        "final_quiz": {
            "questions": final_questions,
            "passing_score": pass_threshold,
            "immediate_feedback": False,
            "shuffle_answers": True
        }
    }


def run(project_root: Path, skip_captions: bool = False) -> None:
    cfg = load_json(project_root / "config" / "build.config.json")
    template_map = load_json(project_root / "config" / "template-map.json")
    animation_cfg = load_json(project_root / "config" / "animation-presets.json")
    build_cfg = cfg.get("build", {})

    storyboard_path = project_root / cfg["paths"]["storyboard_markdown"]
    pronunciation_map_path = project_root / cfg["paths"]["pronunciation_map"]
    prebuilt_dir = project_root / cfg["paths"].get("prebuilt_slides_dir", "templates/slides/prebuilt")
    slide_source = str(build_cfg.get("slide_source", "storyboard")).strip().lower()
    if slide_source not in {"storyboard", "prebuilt"}:
        raise ValueError("build.slide_source must be 'storyboard' or 'prebuilt'.")
    # In prebuilt mode, captions are commonly hand-authored files. Preserve them unless explicitly overridden.
    overwrite_captions = bool(build_cfg.get("overwrite_captions", slide_source != "prebuilt"))

    slides_raw = parse_storyboard_markdown(storyboard_path)
    storyboard_slides = normalize_and_validate(slides_raw)
    prebuilt_sources: dict[str, Path] = {}

    if slide_source == "prebuilt":
        if not prebuilt_dir.exists():
            raise FileNotFoundError(f"Prebuilt slide directory not found: {prebuilt_dir}")
        slides, prebuilt_sources = _load_prebuilt_slides(prebuilt_dir, storyboard_slides)
        if not slides:
            raise ValueError(f"No prebuilt slide files found in: {prebuilt_dir}")
        print(f"Info: using prebuilt slides ({len(slides)}) from {prebuilt_dir}")
    else:
        slides = storyboard_slides
        _apply_animation_defaults(slides, animation_cfg)

    pass_threshold = int(cfg["course"].get("pass_threshold", 80))

    course_data = {
        "meta": cfg["course"],
        "slides": slides,
        "quiz": build_quiz_schema(slides, pass_threshold)
    }

    output_root = project_root / cfg["paths"]["output_root"]
    data_output = project_root / cfg["paths"]["data_output"]
    captions_output = project_root / cfg["paths"]["captions_output"]
    slides_output = project_root / cfg["paths"]["slides_output"]

    removed_slides, removed_captions = _prune_stale_outputs(
        slides,
        slides_output,
        captions_output,
        prune_captions=not skip_captions,
    )
    if removed_slides or removed_captions:
        print(
            "Info: pruned stale generated files "
            f"(slides={removed_slides}, captions={removed_captions})."
        )

    _copy_assets(project_root, output_root)
    missing_sfx = _sanitize_missing_sfx(course_data, project_root)
    if missing_sfx:
        print("Warning: missing SFX files were removed from runtime config:")
        for rel in missing_sfx:
            print(f"  - {rel}")

    write_json(data_output / "course.data.json", course_data)

    pron_map = load_json(pronunciation_map_path)
    tts_rows = []
    preserved_caption_files = 0

    for s in slides:
        clean_vo = apply_pronunciation_map(s["voiceover"], pron_map)
        tts_rows.append({"slide_id": s["id"], "voiceover_clean": clean_vo})
        caption_text = apply_pronunciation_map(s.get("caption_text") or s["voiceover"], pron_map)

        if not skip_captions:
            caption_file = captions_output / f"{s['id']}.vtt"
            if caption_file.exists() and not overwrite_captions:
                preserved_caption_files += 1
                continue
            audio_rel = s.get("audio_vo", "")
            if audio_rel:
                ok = transcribe_to_vtt(project_root / audio_rel, caption_file, model_size="small", language="en")
                if not ok:
                    write_text_vtt(s["id"], caption_text, caption_file)
            else:
                write_text_vtt(s["id"], caption_text, caption_file)

        output_slide_path = slides_output / f"{s['id']}.html"
        output_slide_path.parent.mkdir(parents=True, exist_ok=True)
        if slide_source == "prebuilt":
            src_path = prebuilt_sources.get(s["id"])
            if not src_path:
                raise ValueError(f"Missing prebuilt source for slide '{s['id']}'")
            shutil.copy2(src_path, output_slide_path)
        else:
            template_rel = template_map.get(s["template_id"], template_map.get("content-standard-01"))
            if not template_rel:
                raise ValueError(f"No template for template_id '{s['template_id']}'")
            from render_slides import render_slide_html
            render_slide_html(s, template_rel, project_root, output_slide_path, course_data)

    export_tts_csv(tts_rows, data_output / "tts_script.csv")
    if preserved_caption_files:
        print(
            "Info: preserved existing caption files "
            f"(count={preserved_caption_files}, overwrite_captions={overwrite_captions})."
        )
    build_player_index(output_root / "player" / "index.html", cfg["course"]["title"], project_root)
    write_scorm_manifest(output_root / "imsmanifest.xml", cfg["course"]["id"], cfg["course"]["title"], output_root)

    print(f"Build complete: {output_root}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build local SCORM-ready course shell.")
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Path to project root."
    )
    parser.add_argument(
        "--skip-captions",
        action="store_true",
        help="Skip caption transcription/generation for faster rebuilds.",
    )
    args = parser.parse_args()
    run(args.project_root.resolve(), skip_captions=args.skip_captions)
