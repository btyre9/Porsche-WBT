# Storyboard Builder — Session Notes
**Date:** 2026-04-15
**Status:** In-progress design interview (grill-me). Stopped mid-session to switch computers.

---

## Project Purpose

This folder (`Porsche-WBT-Template`) is the **master template project** for all Porsche WBT modules.
Workflow: copy this folder, rename it to the module name, then build the module inside it.
All rules, workflows, scripts, and templates established here carry forward to every module.

---

## Source Storyboard Being Converted

`/Users/home/Desktop/CC04_WBT_SB_listening.docx`
Course: **CC04 — Listening Skills That Build Trust**
15 content slides + 2 knowledge checks + 10-question final quiz bank (5 drawn randomly)

---

## Pipeline Overview

```
storyboard/CC04.md
    ↓  node scripts/import-storyboard.js --md storyboard/CC04.md
storyboard/course.md          ← canonical slide manifest
storyboard/vo_manifest.csv    ← all VO clips
course/data/tts_script.csv    ← pronunciation-corrected TTS
course/assets/captions/*.vtt  ← placeholder VTT per clip
    ↓  node scripts/generate-slides.js
course/slides/*.html          ← one file per slide
course/data/course.data.json  ← slide order + quiz config
```

---

## Key Decisions Made

### 0. Module Series Scope — CONFIRMED 2026-04-15
The Customer Communications series has **5 total modules** (not 12 as originally drafted).
CC04 is **Module 3 of 5**.

| Module | Code | Position |
|---|---|---|
| TBD | CC01 | Module 1 of 5 |
| Understanding Today's Porsche Customer | CC02 | Module 2 of 5 |
| CC04 Listening Skills That Build Trust | CC04 | Module 3 of 5 |
| TBD | — | Module 4 of 5 |
| TBD | — | Module 5 of 5 |

**Action required:** Every storyboard's `Eyebrow:` field must be manually verified against this table before final build. Any storyboard built before 2026-04-15 may have "Module X of 12" — update to "Module X of 5".

The `Eyebrow:` field in the storyboard `.md` file is the authoritative source. The generator uses it as-is; there is no auto-calculation of module position.

---

### 1. VO Cue Timing — Option B
Generate slides that are **structurally complete and interaction-ready** (content, click/VO logic wired up), but **VO cue times** (the millisecond timestamps that sync bullet/objective animations to narration) are a **manual post-recording step**. Templates include `// TODO: set cue time` markers where needed.

### 2. Card / Tab / Step Content Encoding — Option C
Each interaction element (card, tab, step) groups its **title**, **body**, and **voiceover** together using the same label key. Pipe `|` separates bullet points within a body field.

**Card example (CLICK interaction):**
```md
Card-Title-AccurateDiagnosis: Accurate Diagnosis Starts Here
Card-Body-AccurateDiagnosis: Customers describe symptoms, not diagnoses | Vague descriptions require active interpretation | Misunderstanding leads to misdiagnosis | Careful listening gets you closer
Voiceover-CLICK-AccurateDiagnosis: Customers don't bring you a diagnosis. They bring you a feeling...
```

**Tab example (TAB interaction):**
```md
Tab-Title-Paraphrase: Paraphrase
Tab-Body-Paraphrase: Re-phrasing what the customer said in your own words | Confirms understanding | Starter: "What I hear you saying is..."
Voiceover-TAB-Paraphrase: The first active listening technique is paraphrase...
```

**Step example (STEP interaction):**
```md
Step-Title-1: Face the Person
Step-Body-1: "I am part of this conversation"
Voiceover-STEP-1: Face the person. When you turn your body toward them...
```

### 3. Video Slides — Generate Structured Placeholder
Video slides (SLD_CC04_008, 010, 012) are **generated from a `video-scenario` template** with:
- Video embed path
- Pause-point questions, choices, and correct answers wired up
- `// TODO: set pause timestamp (ms)` markers where video timestamps go
- Timestamps filled in manually after video is edited

**Video slide storyboard fields:**
```md
Template-ID: video-scenario
Video-File: CC04_video_bodylanguage_A.mp4
Pause-Question-1: What did the technician's body language communicate?
Pause-Choice-1-A: Professionalism and interest
Pause-Choice-1-B: That he was too busy to listen
Pause-Choice-1-C: Technical confidence
Pause-Choice-1-D: That the repair was serious
Pause-Correct-1: B
```

---

## Template Inventory

### Templates That Exist (from CC02 — in `/CC02/output/course/slides/`)
These need to be converted to `{{TOKEN}}` templates and placed in `scripts/templates/`.

| Template-ID | CC02 source file | Notes |
|---|---|---|
| `hero-title` | `SLD_CC02_001.html` | Lottie title-line animation, hero image left |
| `content-split` | `SLD_CC02_002.html` | Two-column layout, VO-synced bullets (cue times manual) |
| `learning-objectives` | `SLD_CC02_003.html` | Up to 5 objectives, GSAP stagger, VO-synced emphasis |
| `knowledge-check` | `KC_CC02_001.html` | Modal card, shuffle, correct/incorrect, review-slide link |
| `final-quiz` | `FQ_CC02_001.html` | Modal card, sends sandbox-next with correct flag |
| `fq-score` | `FQ_CC02_SCORE.html` | Pass/fail, cert print, retake |

### Templates That Need to Be Built (new for CC04)
| Template-ID | Used by | Interaction |
|---|---|---|
| `card-explore` | SLD_CC04_004, SLD_CC04_006 | 3-card click-to-reveal, each card plays CLICK VO |
| `content-tab` | SLD_CC04_009 | 4-tab accordion, each tab plays TAB VO |
| `content-steps` | SLD_CC04_007, SLD_CC04_014 | Sequential step reveal, each step plays STEP VO |
| `video-scenario` | SLD_CC04_008, 010, 012 | Video embed + pause-point MC overlays |
| `content-accordion` | SLD_CC04_013 | 3 expandable categories (barriers slide) |
| `content-summary` | SLD_CC04_015 | Closing summary — may reuse content-split |

> **Note:** `generate-slides.js` already has partial `card-explore` support via `buildCardsHtml()` and `buildCardInitScript()` — it generates card shells and audio maps from CLICK triggers, but card body text is a placeholder. The `Card-Title-Label` / `Card-Body-Label` fields need to be added to the parser and template.

---

## Slide ID Convention

**Canonical format:** `SLD_CC04_001`, `KC_CC04_001`, `FQ_CC04_001`, `FQ_CC04_SCORE`
**Legacy format** (CC02 HTML uses hyphens): `SLD-CC02-001` — normalised by the parser.
Going forward: use **underscore** format in all storyboard `.md` files.

---

## VO Trigger Reference

| Key pattern | When it fires |
|---|---|
| `Voiceover-INTRO:` | Plays on slide entry (auto) |
| `Voiceover-CLICK-Label:` | Plays when card/hotspot with that label is clicked |
| `Voiceover-TAB-Label:` | Plays when tab/accordion with that label is revealed |
| `Voiceover-STEP-N:` | Plays at step N in a sequential reveal |

**Generated filename pattern:**
`SLD_CC04_004_CLICK_AccurateDiagnosis.mp3`
`SLD_CC04_007_STEP_1.mp3`
`SLD_CC04_009_TAB_Paraphrase.mp3`

---

## Storyboard MD Format — Working Spec

```md
# Course: CC04 Listening Skills that Build Trust

---

## Slide 01 — Course Title Slide
Slide-ID: SLD_CC04_001
Template-ID: hero-title
Slide-Title: Listening Skills That Build Trust
Eyebrow: Customer Communications — Module 4 of 12
Image-File: CC04_title_background.webp
Voiceover-INTRO: Welcome to Module 4 of the Customer Communications series...

---

## Slide 02 — Topic Introduction
Slide-ID: SLD_CC04_002
Template-ID: content-split
Slide-Title: You Hear All Day. But Are You Listening?
Eyebrow: Know Your Customer
Image-File: CC04_listening_intro.webp
Col-Left-Header: Porsche Customers
Col-Left-Body: Customers describe symptoms — you diagnose the cause | What a customer says and what you hear are often two different things | ...
Col-Right-Header: Your Communication
Col-Right-Body: ...
Voiceover-INTRO: Think about the last time a customer described a problem with their vehicle...

---

## Slide 03 — Learning Objectives
Slide-ID: SLD_CC04_003
Template-ID: learning-objectives
Slide-Title: Module 4 Learning Objectives
Intro-Text: In this module, you'll develop three layers of listening skill.
Image-File: CC04_objectives_photo.webp
Objective-1: Apply attentive body language techniques in face-to-face and video interactions
Objective-2: Use active listening techniques — paraphrase, clarify, perception-check, and summarize
Objective-3: Demonstrate reflective listening to acknowledge customer emotions
Objective-4: Recognize and overcome common barriers to effective listening
Voiceover-INTRO: This module has four learning objectives...

---

## Slide 04 — Why Listening Matters
Slide-ID: SLD_CC04_004
Template-ID: card-explore
Slide-Title: Listening Is a Technical Skill
Voiceover-INTRO: Before we dive into techniques, let's establish why listening matters. Click each panel to explore.
Card-Title-AccurateDiagnosis: Accurate Diagnosis Starts Here
Card-Body-AccurateDiagnosis: Customers describe symptoms, not diagnoses | Vague descriptions like 'feels weird' require active interpretation | Misunderstanding leads to misdiagnosis | Careful listening gets you closer
Voiceover-CLICK-AccurateDiagnosis: Customers don't bring you a diagnosis...
Card-Title-TrustBuilding: Trust Is Built in the Listening
Card-Body-TrustBuilding: Customers know immediately whether you're truly listening | Feeling heard drives customer satisfaction | Service Quality accounts for 34% of CSI
Voiceover-CLICK-TrustBuilding: Trust forms fast in customer interactions...
Card-Title-ApprovedWork: Listening Leads to More Approved Work
Card-Body-ApprovedWork: Customers who feel understood approve more repairs | Your 5-minute listening conversation makes the difference | Great listening is profitable
Voiceover-CLICK-ApprovedWork: The connection between listening and approved work is direct...
```

---

## Open Questions (to resolve in next session)

1. **Step/sequential slides** — Same field pattern as cards/tabs confirmed?
   e.g. `Step-Title-1`, `Step-Body-1`, `Voiceover-STEP-1`?

2. **Video slide fields** — Do we need a `Voiceover-INTRO` on video slides (plays before video starts), or is there no INTRO VO for video slides?

3. **KC slides** — Review-Slide field links back to which slide? Just the content slide before it, or a specific section?

4. **FQ quiz bank** — All 10 questions in one `FQ_CC04_001` through `FQ_CC04_010` sequence, with a separate `Quiz-Group` field to tell the player to draw 5 randomly? Or structured differently?

5. **content-accordion** (SLD_CC04_013 barriers slide) — Same pattern as tabs? Or different template?

6. **Eyebrow text** — Is `Eyebrow:` a universal field on every template, or per-template?

---

## Files to Create / Modify

- [ ] `storyboard/CC04.md` — new storyboard in canonical format
- [ ] `scripts/templates/hero-title.html`
- [ ] `scripts/templates/content-split.html`
- [ ] `scripts/templates/learning-objectives.html`
- [ ] `scripts/templates/card-explore.html`
- [ ] `scripts/templates/content-tab.html`
- [ ] `scripts/templates/content-steps.html`
- [ ] `scripts/templates/video-scenario.html`
- [ ] `scripts/templates/content-accordion.html`
- [ ] `scripts/templates/knowledge-check.html`
- [ ] `scripts/templates/final-quiz.html`
- [ ] `scripts/templates/fq-score.html`
- [ ] Update `scripts/import-storyboard.js` — add Card-Title-*, Card-Body-*, Tab-Title-*, Tab-Body-*, Step-Title-*, Step-Body-*, Pause-* fields
- [ ] Update `scripts/generate-slides.js` — add token builders for new field types
