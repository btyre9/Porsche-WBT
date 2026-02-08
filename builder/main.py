from __future__ import annotations
from pathlib import Path
import argparse
import json
import shutil

from parse_markdown import parse_storyboard_markdown
from normalize_schema import normalize_and_validate
from export_tts_script import apply_pronunciation_map, export_tts_csv
from generate_vtt import transcribe_to_vtt, write_text_vtt
from render_slides import render_slide_html
from build_player import build_player_index
from build_scorm_manifest import write_scorm_manifest


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
                "correct": "assets/sfx/correct.mp3",
                "incorrect": "assets/sfx/incorrect.mp3"
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


def run(project_root: Path) -> None:
    cfg = load_json(project_root / "config" / "build.config.json")
    template_map = load_json(project_root / "config" / "template-map.json")

    storyboard_path = project_root / cfg["paths"]["storyboard_markdown"]
    pronunciation_map_path = project_root / cfg["paths"]["pronunciation_map"]

    slides_raw = parse_storyboard_markdown(storyboard_path)
    slides = normalize_and_validate(slides_raw)
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

    _copy_assets(project_root, output_root)
    missing_sfx = _sanitize_missing_sfx(course_data, project_root)
    if missing_sfx:
        print("Warning: missing SFX files were removed from runtime config:")
        for rel in missing_sfx:
            print(f"  - {rel}")

    write_json(data_output / "course.data.json", course_data)

    pron_map = load_json(pronunciation_map_path)
    tts_rows = []

    for s in slides:
        clean_vo = apply_pronunciation_map(s["voiceover"], pron_map)
        tts_rows.append({"slide_id": s["id"], "voiceover_clean": clean_vo})

        caption_file = captions_output / f"{s['id']}.vtt"
        audio_rel = s.get("audio_vo", "")
        if audio_rel:
            ok = transcribe_to_vtt(project_root / audio_rel, caption_file, model_size="small", language="en")
            if not ok:
                write_text_vtt(s["id"], clean_vo, caption_file)
        else:
            write_text_vtt(s["id"], clean_vo, caption_file)

        template_rel = template_map.get(s["template_id"], template_map.get("content-standard-01"))
        if not template_rel:
            raise ValueError(f"No template for template_id '{s['template_id']}'")
        render_slide_html(s, template_rel, project_root, slides_output / f"{s['id']}.html", course_data)

    export_tts_csv(tts_rows, data_output / "tts_script.csv")
    build_player_index(output_root / "player" / "index.html", cfg["course"]["title"], project_root)
    write_scorm_manifest(output_root / "imsmanifest.xml", cfg["course"]["id"], cfg["course"]["title"])

    print(f"Build complete: {output_root}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build local SCORM-ready course shell.")
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Path to project root."
    )
    args = parser.parse_args()
    run(args.project_root.resolve())
