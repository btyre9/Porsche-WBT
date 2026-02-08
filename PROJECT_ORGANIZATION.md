# Porsche WBT Project Organization

This project builds a SCORM-ready web-based training package from a markdown storyboard and HTML templates.

## High-Level Flow

1. `storyboard/course.md` defines slides and quiz metadata.
2. `builder/main.py` parses and normalizes slides.
3. Quiz data is derived from slide metadata (`Interaction-Type`, `Question`, `Choice-*`, etc.).
4. Course JSON is written to `output/course/data/course.data.json`.
5. Captions are generated per slide (Whisper transcription if available, text fallback otherwise).
6. Slide HTML files are rendered from Jinja templates into `output/course/slides/`.
7. Player shell (`index.html` + `runtime.js`) is built into `output/course/player/`.
8. SCORM manifest is written to `output/course/imsmanifest.xml`.

## Directory Layout

`/Users/home/Documents/Porsche-WBT-Project/builder`
- Python build pipeline modules.

`/Users/home/Documents/Porsche-WBT-Project/config`
- Build settings and template mappings.

`/Users/home/Documents/Porsche-WBT-Project/storyboard`
- Source content (`course.md`) and pronunciation replacements.

`/Users/home/Documents/Porsche-WBT-Project/templates/player`
- Player HTML template and runtime JavaScript.

`/Users/home/Documents/Porsche-WBT-Project/templates/slides`
- Slide templates keyed by `Template-ID`.

`/Users/home/Documents/Porsche-WBT-Project/output/course`
- Generated build artifacts (ignored by git).

## Builder Scripts (What Each One Does)

`/Users/home/Documents/Porsche-WBT-Project/builder/main.py`
- Main entry point.
- Loads config and template map.
- Parses storyboard markdown, normalizes slides, builds quiz schema.
- Copies files from `/assets` (if present) into output.
- Removes missing quiz SFX references from runtime config.
- Writes `course.data.json`.
- Applies pronunciation map and writes `tts_script.csv`.
- Generates `.vtt` caption files.
- Renders slide HTML from templates.
- Builds player index/runtime.
- Writes SCORM manifest.
- CLI:
```bash
python3 /Users/home/Documents/Porsche-WBT-Project/builder/main.py
# or
python3 /Users/home/Documents/Porsche-WBT-Project/builder/main.py --project-root /Users/home/Documents/Porsche-WBT-Project
```

`/Users/home/Documents/Porsche-WBT-Project/builder/parse_markdown.py`
- Reads `course.md`.
- Splits slides by `##` headings.
- Parses `Key: Value` lines into dictionaries.
- Applies defaults for missing `Slide-ID`, `Template-ID`, `Slide-Title`.

`/Users/home/Documents/Porsche-WBT-Project/builder/normalize_schema.py`
- Converts raw parsed slide dictionaries into a normalized schema:
  - `id`, `template_id`, `slide_title`, `voiceover`, `audio_vo`, `raw`.

`/Users/home/Documents/Porsche-WBT-Project/builder/export_tts_script.py`
- Applies pronunciation substitutions using whole-word regex matching.
- Exports cleaned voiceover rows to CSV for TTS workflows.

`/Users/home/Documents/Porsche-WBT-Project/builder/generate_vtt.py`
- Creates WebVTT captions.
- If audio exists and `faster-whisper` is available, transcribes audio.
- Otherwise writes fallback text captions so the pipeline still succeeds.

`/Users/home/Documents/Porsche-WBT-Project/builder/render_slides.py`
- Renders slide HTML via Jinja2 from a template path in `config/template-map.json`.

`/Users/home/Documents/Porsche-WBT-Project/builder/build_player.py`
- Renders `templates/player/index.html.j2`.
- Copies `templates/player/runtime.js` into output player folder.

`/Users/home/Documents/Porsche-WBT-Project/builder/build_scorm_manifest.py`
- Writes a minimal SCORM manifest referencing `player/index.html`.

`/Users/home/Documents/Porsche-WBT-Project/builder/grade_quiz.py`
- Utility helpers for score percentage and pass/fail checks.
- Not currently invoked by `main.py`.

`/Users/home/Documents/Porsche-WBT-Project/builder/generate_certificate.py`
- Writes a simple text certificate placeholder.
- Not currently invoked by `main.py`.

## Config Files

`/Users/home/Documents/Porsche-WBT-Project/config/build.config.json`
- Course metadata (`id`, `title`, `version`, `language`, `pass_threshold`).
- Input/output paths used by the builder.

`/Users/home/Documents/Porsche-WBT-Project/config/template-map.json`
- Maps `Template-ID` values from storyboard to concrete template files.

`/Users/home/Documents/Porsche-WBT-Project/config/animation-presets.json`
- Animation preset definitions.
- Currently not referenced by the active Python build pipeline.

## Storyboard Contract

Each slide section in `storyboard/course.md` can include:
- `Slide-ID`
- `Template-ID`
- `Slide-Title`
- `Audio-VO`
- `Voiceover`
- Quiz fields (for question slides):
  - `Interaction-Type`
  - `Question`
  - `Choice-1`, `Choice-2`, ...
  - `Correct-Answer`
  - `Quiz-Group` (`knowledge` or `final`)

## Player Runtime Behavior

`/Users/home/Documents/Porsche-WBT-Project/templates/player/runtime.js`:
- Loads `../data/course.data.json`.
- Displays slide HTML in an iframe.
- Supports:
  - Prev/Next slide navigation.
  - Knowledge checks with immediate correct/incorrect feedback.
  - Final quiz with no per-question correctness feedback; score shown at end.
- Finds SCORM API (`API_1484_11` or `API`) and reports final score/pass status.
- Optionally plays quiz SFX if configured and files exist.

## Output Artifacts

Expected generated files:
- `output/course/data/course.data.json`
- `output/course/data/tts_script.csv`
- `output/course/assets/captions/*.vtt`
- `output/course/slides/*.html`
- `output/course/player/index.html`
- `output/course/player/runtime.js`
- `output/course/imsmanifest.xml`

## Dependencies

From `/Users/home/Documents/Porsche-WBT-Project/requirements.txt`:
- `Jinja2>=3.1`
- `faster-whisper>=1.0` (optional in practice; build falls back if missing)

Install and run:
```bash
cd /Users/home/Documents/Porsche-WBT-Project
python3 -m pip install -r requirements.txt
python3 builder/main.py
```

## Current Project Notes

- There is no `/Users/home/Documents/Porsche-WBT-Project/assets` directory right now, so asset copying is skipped.
- If `assets/sfx/correct.mp3` and `assets/sfx/incorrect.mp3` are missing, runtime SFX config is automatically removed with a warning.
- `templates/player/index.html` exists, but the build uses `templates/player/index.html.j2` as the source template.
