# Porsche WBT Project Guide

## What This Project Is For

This repository builds a SCORM-ready web-based training course from:
- Storyboard metadata (`storyboard/course.md`)
- Slide templates or prebuilt slide HTML (`templates/slides/`)
- Shared media assets (`assets/`)

The output is generated into `output/course/` and is ready for LMS packaging.

## How It Works

The main build entry point is `builder/main.py`.

Build pipeline:
1. Load config from `config/build.config.json` and template map from `config/template-map.json`.
2. Parse storyboard markdown (`storyboard/course.md`) into slide metadata.
3. Normalize slide schema and derive quiz structure (`knowledge_checks` + `final_quiz`).
4. Choose slide source mode:
   - `storyboard`: render templates from `Template-ID`.
   - `prebuilt`: copy HTML from `templates/slides/prebuilt/` (this repo is currently set to this mode).
5. Copy all project assets into output.
6. Generate captions (`.vtt`) per slide (Whisper if available, text fallback otherwise).
7. Write course data to `output/course/data/course.data.json`.
8. Build player shell (`output/course/player/index.html`, `runtime.js`, `cue-studio.html`).
9. Write SCORM manifest (`output/course/imsmanifest.xml`).

Runtime behavior is handled by `templates/player/runtime.js`, which:
- Loads `../data/course.data.json`
- Navigates slides in an iframe
- Runs knowledge checks and final quiz tracking
- Loads captions from `../assets/captions/`
- Loads interaction audio maps from `../assets/interaction-audio/`
- Reports completion/score to SCORM APIs when available

## Key Folders

- `builder/`: Python build pipeline and utilities
- `config/`: build config, animation presets, template mapping
- `storyboard/`: course source metadata and pronunciation map
- `templates/player/`: player HTML/JS templates
- `templates/slides/`: reusable slide templates + `prebuilt/` slide HTML
- `sandbox/`: slide design/testing environment before promotion
- `assets/`: shared fonts, media, icons, audio, cue maps
- `output/course/`: generated course package

## Current Build Mode

`config/build.config.json` currently uses:
- `build.slide_source = "prebuilt"`

That means final slide HTML is taken from `templates/slides/prebuilt/slide-*.html`, while storyboard metadata still drives ordering, quiz data, captions, and output structure.

## Process To Build Training Slides

### Recommended Workflow (Current Repo Setup)

1. Design and test slide in sandbox:
   - Edit/create `sandbox/slides/SLD-...html`
   - Add VO/captions/cues as needed under `sandbox/audio`, `sandbox/captions`, `sandbox/animation-cues`
   - Preview with `sandbox/index.html`
2. Promote finished slide into Player/prebuilt structure:
   - `python builder/promote_sandbox_slide.py --slide SLD-CC01-004`
3. Ensure storyboard includes slide metadata:
   - Slide section in `storyboard/course.md`
   - `Slide-ID` must match promoted file format (`slide-SLD-...` after promotion)
   - Include quiz fields if the slide is a question slide
4. Run full build:
   - `python builder/main.py --project-root .`
5. Test generated player:
   - Open `output/course/player/index.html` via local server (not `file://`)
6. Package for LMS:
   - `python builder/package_scorm_zip.py --output-root output/course`

### Storyboard-Template Workflow (Alternative)

If you want slides rendered from template IDs instead of prebuilt HTML:
1. Set `config/build.config.json` -> `build.slide_source` to `"storyboard"`.
2. Author slide sections in `storyboard/course.md` with valid `Template-ID`.
3. Build with `python builder/main.py --project-root .`.
4. Validate output in `output/course/slides/`.

## Storyboard Authoring Contract (Important)

Each slide is a `##` section with single-line `Key: Value` entries.

Common keys:
- `Slide-ID`
- `Template-ID`
- `Slide-Title`
- `Voiceover`
- `Caption-Text`
- `On-Screen-Text`
- `Audio-VO`
- `Animation-Intro` (`FadeIn`, `SlideUp`, `ScaleIn`)

Quiz keys:
- `Interaction-Type` (ex: `mcq`)
- `Quiz-Group` (`knowledge` or `final`)
- `Question`
- `Choice-1`, `Choice-2`, ...
- `Correct-Answer` (must exactly match one choice value)

## Daily Commands

Install Python dependencies:
```bash
python -m pip install -r requirements.txt
```

Build once:
```bash
python builder/main.py --project-root .
```

Watch mode rebuilds:
```powershell
.\watch-build.ps1
```

Dev start script (launches server + watcher):
```powershell
.\start-dev.ps1
```

Create SCORM zip:
```bash
python builder/package_scorm_zip.py --output-root output/course
```

## Notes and Gotchas

- `watch-build.ps1` currently references a specific local Python path; update it if Python is installed elsewhere.
- `start-dev.ps1` expects `http-server` to be available on PATH.
- Caption output in generated course is `output/course/assets/captions/*.vtt`.
- Keep media paths project-relative (for example `assets/audio/vo/...`).
- `faster-whisper` improves caption generation from audio but build still works with text fallback when unavailable.
