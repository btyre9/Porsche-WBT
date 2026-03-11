# Storyboard-to-Course Workflow
### Porsche WBT — CC01 Module Pipeline

---

## Overview

The pipeline turns a Word storyboard document into everything the course needs:
voiceover audio, captions, TTS scripts, and course data. The storyboard is the
single source of truth — all other files are generated from it.

```
Storyboard (.docx)
       │
       ▼
import-storyboard
       │
       ├──▶  storyboard/course.md          (slide summary)
       ├──▶  storyboard/vo_manifest.csv    (all VO clips)
       ├──▶  course/data/tts_script.csv    (pronunciation-corrected)
       └──▶  course/assets/captions/*.vtt  (placeholder captions)
                    │
                    ▼
             generate-vo  (WellSaid API)
                    │
                    └──▶  course/assets/audio/vo/*.mp3
                                   │
                                   ▼
                          generate-vtt --whisper  (OpenAI)
                                   │
                                   └──▶  course/assets/captions/*.vtt
                                         (word-accurate, replaces placeholders)
```

---

## Phase 1 — Create the Storyboard

### Option A: AI-generated (recommended)

Give Claude or Copilot the following prompt along with your content outline:

> "Generate a Porsche WBT storyboard for the following module content.
> Use the Key: Value format below. Each slide starts with a Heading 2
> in the format 'Slide 01 — Title'. Use >> lines to show VO clip triggers
> and filenames. Follow the Field Reference at the end of
> CC01-Mock-Storyboard.docx for all field names and slide types."

Then paste in your content outline (learning objectives, key messages,
quiz questions, etc.). The AI will produce a storyboard you can paste
directly into Word.

### Option B: Edit the mock storyboard

1. Open `storyboard/CC01-Mock-Storyboard.docx`
2. Edit the slide content — replace the example text with real content
3. Add or remove slides by copying/deleting slide sections
4. Save as your module's storyboard file (e.g. `CC01-Storyboard.docx`)

### Storyboard format rules

Each slide section must follow this structure:

```
## Slide 01 — Slide Title Here

Slide-ID: SLD-CC01-001
Template-ID: hero-title
Slide-Title: Slide Title Here
>> On slide load → SLD-CC01-001-INTRO.mp3
Voiceover-INTRO: The voiceover that plays when the slide loads.
Caption-Text: The closed-caption text (usually matches Voiceover-INTRO).
Image: Description of what the image should show. Replace with filename when asset is ready.
Status: Draft
Notes: Any developer or production notes.
```

For interactive slides with multiple VO clips:

```
>> On slide load → SLD-CC01-004-INTRO.mp3
Voiceover-INTRO: Click each card to explore the five pillars.
>> User clicks Appearance card → SLD-CC01-004-CLICK-Appearance.mp3
Voiceover-CLICK-Appearance: Your professional appearance communicates competence...
>> User clicks Communication card → SLD-CC01-004-CLICK-Communication.mp3
Voiceover-CLICK-Communication: Clear, jargon-free communication builds trust...
```

**Rules:**
- `>>` lines are stage directions — they appear in the document but the
  parser ignores them. Use them to show what triggers each clip and what
  the output filename will be.
- Every VO field must follow the pattern `Voiceover-TRIGGER` or
  `Voiceover-TRIGGER-Label` (see Trigger Types below).
- Slide headings must contain "Slide" followed by a number.
- The Field Reference section at the end of the document is automatically
  ignored by the parser.

### Trigger types

| Field | When it plays | Example filename |
|---|---|---|
| `Voiceover-INTRO` | On slide load | `SLD-CC01-001-INTRO.mp3` |
| `Voiceover-CLICK-Label` | User clicks a card or hotspot | `SLD-CC01-004-CLICK-Appearance.mp3` |
| `Voiceover-TAB-Label` | User opens a tab or accordion | `SLD-CC01-005-TAB-Charging.mp3` |
| `Voiceover-STEP-N` | User advances a step sequence | `SLD-CC01-007-STEP-02.mp3` |

### Slide ID naming

| Type | Format | Example |
|---|---|---|
| Standard slide | `SLD-CC01-001` | Numbered in sequence |
| Knowledge check | `KC-CC01-001` | Numbered in sequence |
| Final quiz | `FQ-CC01-001` | Numbered in sequence |
| Score slide | `FQ-CC01-SCORE` | One per module |

### Template types

| Template-ID | Description |
|---|---|
| `hero-title` | Full-bleed opening slide — large title, background image |
| `content-stat` | Text slide with a highlighted statistic or pull quote |
| `card-explore` | Clickable cards — each card triggers its own VO clip |
| `split-explore` | Two-panel slide — INTRO VO, then CLICK triggers part 2 |
| `content-split` | Split-screen layout with sequential section reveals — no CLICK required |
| `video-bg` | Looping background video with VO overlay |
| `knowledge-check` | Mid-course multiple-choice — wrong answer returns to review slide |
| `final-quiz` | Scored multiple-choice — results reported to SCORM |

---

## Phase 2 — Parse the Storyboard

Run the import script against your `.docx` file:

```bash
npm run import-storyboard -- --docx storyboard/CC01-Storyboard.docx
```

**What it generates:**

| File | Description |
|---|---|
| `storyboard/course.md` | Markdown summary of all slides — review this to verify parsing |
| `storyboard/vo_manifest.csv` | All VO clips with filenames, trigger types, and raw text |
| `course/data/tts_script.csv` | Pronunciation-corrected VO text — one row per clip |
| `course/assets/captions/*.vtt` | Placeholder VTT per clip — one file per audio clip |

**Review `storyboard/course.md` first.** If any slides are missing or
fields are misread, fix the storyboard document and re-run the import.

**Common issues:**
- Slide not found → check the heading contains "Slide" and a number
- Field not parsed → check the field name matches the Field Reference list
- Wrong slide count → check for stray `Slide XX` text in notes or headers

---

## Phase 3 — Generate Voiceover Audio

You have two options:

### Option A: WellSaid API (automated)

Run the VO generator directly:

```bash
npm run generate-vo -- --key YOUR_WELLSAID_API_KEY --speaker SPEAKER_ID
```

Or pass it through the import step (does everything in one command):

```bash
npm run import-storyboard -- --docx storyboard/CC01-Storyboard.docx \
  --wellsaid --ws-key YOUR_WELLSAID_API_KEY --ws-speaker SPEAKER_ID
```

Set environment variables to avoid typing keys each time:

```bash
# Add to your shell profile or .env
WELLSAID_API_KEY=your_key_here
WELLSAID_SPEAKER_ID=your_speaker_id_here
```

Then just:

```bash
npm run generate-vo
```

Audio files are saved to `course/assets/audio/vo/` with the correct names
automatically. A placeholder VTT is written for each clip as it is saved.

**To regenerate a single clip** (e.g. after editing the VO text):

```bash
npm run generate-vo -- --clip SLD-CC01-004-CLICK-Appearance --force
```

### Option B: Manual / send CSV to WellSaid

1. Open `course/data/tts_script.csv`
2. Send the `VoiceoverText` column to WellSaid (or any TTS service)
3. Name the exported audio files exactly as shown in the `FileName` column
4. Place the `.mp3` files in `course/assets/audio/vo/`

---

## Phase 4 — Generate Accurate Captions

Placeholder VTTs are created automatically during the import step. Once
real audio is in `course/assets/audio/vo/`, replace them with
word-accurate captions using OpenAI Whisper:

```bash
npm run generate-vtt -- --whisper --key YOUR_OPENAI_API_KEY
```

To regenerate a single clip's captions:

```bash
npm run generate-vtt -- --whisper --key YOUR_OPENAI_API_KEY \
  --clip SLD-CC01-004-CLICK-Appearance
```

VTT files are written to `course/assets/captions/` with names matching
their audio clip — e.g. `SLD-CC01-004-CLICK-Appearance.vtt`.

---

## Phase 5 — Source Media Assets

The `Image` and `Video` fields in the storyboard are art direction
descriptions, not filenames. The media team uses these descriptions to
source or produce the actual assets.

**Workflow:**
1. Share `storyboard/course.md` with the media team — it lists every
   `Image` and `Video` description in one readable file
2. Media team sources/shoots/creates the assets
3. Once an asset is ready, update the storyboard:
   - Replace `Image: description...` with `Image-File: actual-filename.webp`
   - Or keep both — `Image` as the brief, `Image-File` as the filename
4. Place finished assets in `course/assets/images/` or `course/assets/video/`

---

## Phase 6 — Preview and QA

Start the local player to preview the course:

```bash
npm run start-player
# Opens at http://localhost:8080
```

Test the SCORM package locally (mirrors the production environment):

```bash
npm run test-scorm
# Opens at http://localhost:8081
```

**QA checklist:**
- [ ] All slides load and display correctly
- [ ] INTRO VO plays on each slide
- [ ] CLICK/TAB/STEP clips trigger correctly on interaction
- [ ] Captions appear and match the audio
- [ ] Knowledge check wrong answers return to the correct review slide
- [ ] Final quiz scores are reported correctly
- [ ] Next button locks/unlocks as expected

---

## Phase 7 — Package for SCORM

*(Details in SLIDE-PATTERNS.md §10)*

Sync updated slides and runtime to the output folder, then build the zip.
Upload `output/porsche-cc01-scorm.zip` to SCORM Cloud for final testing
before delivery.

---

## Quick Reference — All Commands

```bash
# Parse storyboard (generates manifest, TTS script, placeholder VTTs)
npm run import-storyboard -- --docx storyboard/CC01-Storyboard.docx

# Parse + generate audio in one step
npm run import-storyboard -- --docx storyboard/CC01-Storyboard.docx \
  --wellsaid --ws-key KEY --ws-speaker ID

# Generate audio from existing manifest
npm run generate-vo -- --key KEY --speaker ID

# Regenerate one clip (overwrite existing)
npm run generate-vo -- --key KEY --speaker ID \
  --clip SLD-CC01-004-CLICK-Appearance --force

# Generate placeholder VTTs from manifest
npm run generate-vtt

# Generate word-accurate VTTs from real audio (Whisper)
npm run generate-vtt -- --whisper --key OPENAI_KEY

# Export pronunciation-corrected TTS script from manifest
npm run export-tts

# Preview course
npm run start-player

# Test SCORM package
npm run test-scorm
```

---

## File Locations Reference

```
storyboard/
  CC01-Storyboard.docx       ← source storyboard (edit this)
  CC01-Mock-Storyboard.docx  ← format reference / template
  CC01-Mock-Storyboard.md    ← same content, markdown version
  course.md                  ← parser output — slide summary
  vo_manifest.csv            ← all VO clips with metadata
  WORKFLOW.md                ← this file

course/
  assets/
    audio/
      vo/                    ← VO audio files (*.mp3)
      interaction/           ← click/interaction audio
    captions/                ← VTT caption files (*.vtt)
    images/                  ← slide images
    video/                   ← background videos
    fonts/                   ← Porsche Next TT
    vendor/                  ← GSAP, porsche-components.js
  data/
    course.data.json         ← course structure (player reads this)
    tts_script.csv           ← pronunciation-corrected VO script
  slides/                    ← HTML slide files
  index.html                 ← dev player entry point

output/
  course/                    ← SCORM-ready copy
  porsche-cc01-scorm.zip     ← deliverable
```
