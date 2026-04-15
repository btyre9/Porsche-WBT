# Storyboard Format v1

## Goal
Define a deterministic storyboard format that the parser can reliably convert into:
- `storyboard/course.md`
- `storyboard/vo_manifest.csv`
- `course/data/tts_script.csv`
- `course/assets/captions/*.vtt`
- optional WellSaid audio via `--wellsaid`

## Recommended authoring format
Use one slide block per section.

```md
# Course: CC04 Listening Skills that Build Trust

## Slide 01 - Course Title Slide
Slide-ID: SLD_CC04_001
Template-ID: hero-title
Slide-Title: Course Title Slide
Screen-Type: Content
Interaction-Logic: Auto-advance after VO
Voiceover: Welcome to Module 4...
```

## Required fields per slide
- `Slide-ID`
- `Template-ID` (if omitted, parser infers a default)
- `Slide-Title`

## Voiceover fields
### Entry narration
- `Voiceover:` or `Voiceover-INTRO:`

### Interaction narration (preferred explicit format)
Use explicit triggers for deterministic output filenames:

```md
Voiceover-CLICK-Card1: Customers don't bring you a diagnosis...
Voiceover-CLICK-Card2: Trust forms fast in customer interactions...
Voiceover-CLICK-Card3: The connection between listening and approved work is direct...
```

Supported trigger keys:
- `Voiceover-INTRO`
- `Voiceover-CLICK-<Label>`
- `Voiceover-TAB-<Label>`
- `Voiceover-STEP-<Number>`

### Legacy marker format (supported)
If a single `Voiceover:` block contains tagged markers, the parser auto-splits them:

```md
Voiceover: Intro text... [After Card 1] ... [After Card 2] ...
```

Notes:
- Markers are converted into separate interaction clips.
- Explicit `Voiceover-CLICK-*` keys are preferred for long-term consistency.

## Slide ID convention
Use this canonical pattern:
- `SLD_CC04_001`
- `KC_CC04_001`
- `FQ_CC04_001`
- `FQ_CC04_SCORE`

Legacy IDs like `CC04_SLD_001` are normalized by the parser.

## WellSaid generation
Generate audio directly from parser output:

```bash
node scripts/import-storyboard.js \
  --docx /path/to/storyboard.docx \
  --wellsaid \
  --ws-key <WELLSAID_API_KEY> \
  --ws-speaker <WELLSAID_SPEAKER_ID>
```

or in two steps:

```bash
npm run import-storyboard -- --docx /path/to/storyboard.docx
npm run generate-vo -- --key <WELLSAID_API_KEY> --speaker <WELLSAID_SPEAKER_ID>
```

## Interaction audio rule
For any slide where clicking reveals new content, provide separate interaction VO clips.
Do not rely on one long narration for all reveals.

## Iteration plan
1. Lock this v1 contract for new modules.
2. Add `validate-storyboard` checks for required fields and ID patterns.
3. Add per-template required field rules.
4. Rev to v2 only when changes are backward-compatible or migration notes are provided.
