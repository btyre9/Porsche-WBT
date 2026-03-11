# Porsche WBT — Slide Patterns & Pitfalls

Reference document for the CC01 (and future) module builds.
Captures every recurring bug, working pattern, and design decision made during development.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Shim — What It Does and What It Can't](#2-the-shim--what-it-does-and-what-it-cant)
3. [Audio Patterns](#3-audio-patterns)
4. [Next Button Lock / Unlock](#4-next-button-lock--unlock)
5. [Card Interaction Patterns](#5-card-interaction-patterns)
6. [Video Patterns](#6-video-patterns)
7. [GSAP Patterns](#7-gsap-patterns)
8. [Score Tracking (Final Quiz)](#8-score-tracking-final-quiz)
9. [Asset Path Rules](#9-asset-path-rules)
10. [SCORM Packaging](#10-scorm-packaging)
11. [New Slide Checklist](#11-new-slide-checklist)

---

## 1. Architecture Overview

```
course/
  index.html        ← dev player shell
  runtime.js        ← dev player logic (keep in sync with output/)
  slides/           ← EDIT SLIDES HERE (not sandbox/)
  assets/           ← fonts, images, icons, audio, video, vendor

output/
  course/
    player/
      index.html    ← SCORM player shell
      runtime.js    ← SCORM player logic
    slides/         ← synced from course/slides/ before packaging
    assets/         ← synced from course/assets/
  porsche-cc01-scorm.zip ← final deliverable
```

**Editing flow:**
1. Edit slides in `course/slides/`
2. Test via `npm run start-player` → `http://localhost:8080`
3. When ready to package: sync `course/slides/` → `output/course/slides/`, rebuild zip

**Slide dimensions:** 1920 × 920px (not 1080 — accounts for player chrome)

### CRITICAL: Two runtimes, two different base paths

| Runtime | File | Player page | Correct relative prefix |
|---|---|---|---|
| Dev player | `course/runtime.js` | `course/index.html` (root) | `./` |
| SCORM player | `output/course/player/runtime.js` | `player/index.html` (subdirectory) | `../` |

**Never copy `course/runtime.js` over `output/course/player/runtime.js` with a plain file copy.** The dev runtime uses `./assets/`, `./data/`, `./slides/` — all of which resolve relative to the course root. The SCORM player sits one level deeper in `player/`, so it must use `../assets/`, `../data/`, `../slides/`.

**Symptom when broken:** SCORM Cloud shows a blank screen. The `fetch("./data/course.data.json")` fails with a 404, `init()` throws, and the `.catch` handler replaces `body.innerHTML` with `"Player init failed. See console."` — which SCORM Cloud renders as blank.

**When syncing bug fixes from `course/runtime.js` → `player/runtime.js`:** Apply only the changed logic, then audit for any `./` that should be `../`. Or use a targeted script instead of a raw file copy.

---

## 2. The Shim — What It Does and What It Can't

Every slide includes a `SandboxRuntime` shim (inline `<script>` near the bottom).
It bridges the slide's audio/interaction code to the player's `CourseRuntime` API.

### How it works

- **`voAudio`** — a fake Audio object. `currentTime` polls `CourseRuntime.getAudioCurrentTime()`. Fires synthetic `timeupdate` and `ended` events via RAF loop.
- **`interactionAudio`** — a fake Audio object. `.play()` delegates to `CourseRuntime.playInteractionAudio({ src })`.

### Known limitation — `ended` does NOT fire for swapped audio

When a slide sends `sandbox-swap-audio` (mid-slide audio change), the runtime replaces `state.audio` with a new `Audio` element. The shim's RAF poll reads `getAudioCurrentTime()` which now tracks the NEW audio. But the shim's `_wasPlaying` flag may never transition from `false → true → false` for the new clip (because `attemptStartAudioPlayback()` is called via postMessage with no user gesture, and on some browsers the audio starts silently without `isAudioPlaying()` returning true).

**Result:** Any code inside `SandboxRuntime.voAudio.addEventListener('ended', ...)` that runs AFTER a `sandbox-swap-audio` is unreliable — it may never execute.

**Solution — use `endCue` instead:**

```javascript
// In the slide — add endCue to the swap message:
window.parent.postMessage({
  type:   'sandbox-swap-audio',
  src:    'assets/audio/vo/SLD-CC01-008-2.mp3',
  endCue: '../assets/audio/vo/Click_The_Next_Button_To_Continue.mp3'
}, '*');

// The runtime's onSwapEnded DOM listener handles it directly — no shim involved.
// (Already wired in both runtimes — nothing else needed in the slide.)
```

The runtime reads `e.data.endCue` and calls `playInteractionAudio({ src: swapEndCue })` from the native DOM `ended` listener. This bypasses the shim entirely.

---

## 3. Audio Patterns

### 3a. Standard VO-triggered end-of-slide cue

Works reliably on slides that do NOT use `sandbox-swap-audio`.

```javascript
SandboxRuntime.voAudio.addEventListener('ended', function () {
  SandboxRuntime.interactionAudio.src = '../assets/audio/vo/Click_The_Next_Button_To_Continue.mp3';
  SandboxRuntime.interactionAudio.play().catch(function () {});
});
```

### 3b. Mid-slide audio swap (two-part VO slides)

Used on slides like SLD-CC01-008 where part 2 audio starts only after a user interaction.

```javascript
window.parent.postMessage({ type: 'sandbox-lock-next' }, '*');
window.parent.postMessage({
  type:   'sandbox-swap-audio',
  src:    'assets/audio/vo/SLD-CC01-008-2.mp3',   // relative to player page
  endCue: '../assets/audio/vo/Click_The_Next_Button_To_Continue.mp3'
}, '*');

// Track part 2 timeline via timeupdate (this DOES work for swapped audio):
SandboxRuntime.voAudio.addEventListener('timeupdate', function () {
  var t = SandboxRuntime.voAudio.currentTime;
  // reveal detail panels, etc.
});
// Do NOT rely on SandboxRuntime.voAudio.addEventListener('ended') for post-swap logic.
// Use endCue instead (see §2).
```

**Note on path format for `src` vs `endCue`:**
- `src` in `sandbox-swap-audio`: relative to the **player page** (e.g., `assets/audio/vo/...` — no `../`)
- `endCue`: relative to the **player page**, starting with `../` (e.g., `../assets/audio/vo/...`)
- `interactionAudio.src`: relative to the **player page**, starting with `../`

### 3c. Interaction audio (click-triggered clips)

```javascript
SandboxRuntime.interactionAudio.src = '../assets/audio/interaction/SLD-CC01-008-passion.mp3';
SandboxRuntime.interactionAudio.play().catch(function () {});
```

Or using `playInteractionClip` (requires audio entries in `course.data.json`):
```javascript
SandboxRuntime.playInteractionClip('passion');
```

---

## 4. Next Button Lock / Unlock

The player has two independent locks on the Next button. **Both must be clear** for Next to be enabled:

| Lock | Set by | Cleared by |
|---|---|---|
| `nextLockedByAudio` | Player: when VO audio starts | Player: when VO audio ends (via `onAudioEnded`) |
| `nextLockedByInteraction` | Slide: `sandbox-lock-next` message | Slide: `sandbox-unlock-next` message OR runtime belt-and-suspenders in `onSwapEnded` |

### Lock Next on load, unlock when interaction completes

```javascript
// On slide load:
window.parent.postMessage({ type: 'sandbox-lock-next' }, '*');

// When user has completed all required interactions:
window.parent.postMessage({ type: 'sandbox-unlock-next' }, '*');
```

### Lock cards until VO ends, then unlock

```javascript
window.parent.postMessage({ type: 'sandbox-lock-next' }, '*');

// Lock card clicks until VO audio finishes:
var cardsUnlocked = false;
function unlockCards() {
  if (cardsUnlocked) return;
  cardsUnlocked = true;
  document.getElementById('card-grid').classList.remove('is-locked');
}

setTimeout(function () {
  var vo = SandboxRuntime.voAudio;
  if (vo) {
    vo.addEventListener('ended', unlockCards);
    vo.addEventListener('error', unlockCards);
  }
  // Fallback: only unlock immediately if no CourseRuntime exists
  // (i.e. local file test without the player). In the player, trust ended/error.
  // NEVER use a fixed timeout — if the intro VO is longer than the timeout,
  // the cards will unlock while VO is still playing.
  try {
    if (!window.parent || !window.parent.CourseRuntime) unlockCards();
  } catch (_) { unlockCards(); }
}, 0);

// Unlock Next only after all cards visited:
function revealComplete() {
  window.parent.postMessage({ type: 'sandbox-unlock-next' }, '*');
}
```

### Belt-and-suspenders for swapped audio

The runtime's `onSwapEnded` listener (in both `course/runtime.js` and `output/course/player/runtime.js`) already clears **both** locks when swapped audio ends. Slides do not need to send `sandbox-unlock-next` from a shim `ended` handler — it's handled at the runtime level automatically when using `sandbox-swap-audio`.

---

## 5. Card Interaction Patterns

### 5a. Flip / reveal cards (multiple, all must be visited)

Pattern: Lock cards until VO ends. Track all-visited state. Unlock Next when complete.

```javascript
var totalCards = 6;
var visitedCards = new Set();

function onCardClick(cardId) {
  visitedCards.add(cardId);
  // reveal card content...
  if (visitedCards.size >= totalCards) {
    revealComplete();
  }
}

function revealComplete() {
  // show summary / outro UI
  window.parent.postMessage({ type: 'sandbox-unlock-next' }, '*');
}
```

### 5b. Single interactive card (e.g. SLD-CC01-008 Service Quality)

- Card should be visually inert (chip opacity 0, `pointer-events: none`) until VO ends
- Guard function call with a `part1Complete` flag
- Clicking triggers `sandbox-swap-audio` for part 2 VO

```javascript
var part1Complete = false;

function unlockCard() {
  part1Complete = true;
  var card = document.getElementById('my-card');
  card.classList.add('is-unlocked'); // CSS: opacity 1, pointer-events auto, cursor pointer
}

SandboxRuntime.voAudio.addEventListener('ended', function () {
  unlockCard();
});

function onCardClick() {
  if (!part1Complete) return; // guard: ignore clicks before VO ends
  // trigger part 2...
}
```

**CSS pattern for a card that starts inactive:**
```css
.explore-chip {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s;
}
.card.is-unlocked .explore-chip {
  opacity: 1;
  pointer-events: auto;
  animation: pulse-chip 2.2s ease-in-out infinite;
}
```

---

## 6. Video Patterns

### 6a. Standard loop from beginning (preferred)

Always set `currentTime = 0` explicitly before calling `play()`. Browsers can cache the last video position across page reloads, causing the video to start mid-clip on a fresh load.

```javascript
var vid = document.getElementById('panel-video');
vid.currentTime = 0;
vid.play().catch(function () {});
```

```html
<video id="panel-video" muted playsinline loop autoplay>
  <source src="../assets/video/Customer-communications-video1_1.webm" type="video/webm">
</video>
```

### 6b. Loop starting mid-clip (mp4 only — avoid with WebM)

Use `loadedmetadata` to seek to the desired start frame, then play. The `loop` attribute loops back to 0 after the clip ends.

```javascript
var vid = document.getElementById('panel-video');
vid.addEventListener('loadedmetadata', function () {
  vid.pause();
  vid.currentTime = 25; // seek to 25 seconds
});
vid.addEventListener('seeked', function onFirstSeek() {
  vid.removeEventListener('seeked', onFirstSeek);
  vid.playbackRate = 0.5;
  vid.play().catch(function () {});
});
```

```html
<video id="panel-video" muted playsinline loop autoplay>
  <source src="../assets/video/my-video.mp4" type="video/mp4">
</video>
```

**Only use this pattern with `.mp4` files — never `.webm` (see §6c).**

### 6c. WebM vs MP4

| Scenario | WebM | MP4 |
|---|---|---|
| Play from frame 0 | ✅ Works | ✅ Works |
| Seek to specific time | ❌ Freezes on first frame in SCORM Cloud iframes | ✅ Works |
| File size | Smaller | Larger |

**Rule:** If the video plays from the beginning (`currentTime = 0`) — WebM is fine. If you need to seek to a mid-clip start point, use MP4.

**Root cause of WebM seek freeze:** SCORM Cloud iframes impose stricter security headers that block the range requests WebM needs for random-access seeking. MP4's byte-range headers work within these constraints.

### 6d. CSS for video as background panel

```css
.image-panel video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  display: block;
  filter: brightness(0.55) saturate(0.3); /* blend with dark slide bg */
}
```

---

## 7. GSAP Patterns

### 7a. `overwrite: true` — required when tweens compete

If a new tween targets the same property on the same element as a still-running tween, GSAP will run both simultaneously and they'll fight. At faster playback speeds (or with time-based cues), entrance and exit tweens can overlap.

**Always add `overwrite: true` to exit/fade tweens:**

```javascript
// BAD — if entrance zoom is still running, this fade-out fights it:
gsap.to('#intro-image', { opacity: 0, scale: 0.90, duration: 1.2 });

// GOOD:
gsap.to('#intro-image', { opacity: 0, scale: 0.90, duration: 1.2, overwrite: true });
```

### 7b. Initial hidden state for GSAP-animated elements

Set via `gsap.set()` so GSAP owns the property from the start (avoids flash of content):

```javascript
gsap.set(document.querySelectorAll('.dim-card'), {
  opacity: 0, scale: 0.88, transformOrigin: 'center center'
});
```

Do NOT hide these elements with CSS `opacity: 0` if GSAP controls them — GSAP needs to own the property from the outset.

### 7c. Shimmer pattern on cards

```css
.card.is-shimmer::before {
  content: '';
  position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0) 30%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0) 70%
  );
  background-size: 400%;
  animation: shimmer 2.8s infinite linear;
  pointer-events: none;
}
@keyframes shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position:   0% 0; }
}
/* Card must have position: relative */
/* Card children must have position: relative; z-index: 1 to sit above shimmer */
```

---

## 8. Score Tracking (Final Quiz)

### How it works

- FQ slides (e.g., `FQ-CC01-001` through `FQ-CC01-004`) send `sandbox-next` with a `correct` boolean
- The runtime (`sandbox-next` handler) increments `state.finalAnswered` and `state.finalCorrect`
- `FQ-CC01-SCORE` calls `window.parent.CourseRuntime.getFinalResults()` to read the totals

### From the FQ slide (answering a question):

```javascript
window.parent.postMessage({
  type:    'sandbox-next',
  correct: userAnsweredCorrectly  // boolean
}, '*');
```

### From the score slide:

```javascript
var results = window.parent.CourseRuntime.getFinalResults();
// results = { correct: N, answered: N, total: N }
var pct = Math.round((results.correct / results.total) * 100);
var passed = pct >= 80; // or whatever the pass threshold is
```

### Retake Module button:

```javascript
window.parent.postMessage({ type: 'sandbox-goto', target: 'start' }, '*');
// Runtime resets finalAnswered + finalCorrect and goes to slide 0
```

### `finalTotal` source

The runtime derives `finalTotal` by counting FQ slide IDs in the manifest (not from `course.data.json`'s `questions[]` array, which may be empty).

---

## 9. Asset Path Rules (Slides)

All paths are **relative to the slide file** (`course/slides/SLD-CC01-XXX.html`):

| Asset type | Path |
|---|---|
| Fonts | `../assets/fonts/porsche-next-tt.ttf` |
| Images | `../assets/images/My-Image.webp` |
| Icons | `../assets/icons/my-icon.svg` |
| GSAP | `../assets/vendor/gsap/gsap.min.js` |
| Porsche Components | `../assets/vendor/porsche-components.js` |
| VO audio | `../assets/audio/vo/SLD-CC01-XXX.mp3` |
| Interaction audio | `../assets/audio/interaction/SLD-CC01-XXX-descriptor.mp3` |
| Video | `../assets/video/my-video.mp4` |

### `src` in `sandbox-swap-audio` (path relative to **player page**, not slide):

```javascript
window.parent.postMessage({
  type: 'sandbox-swap-audio',
  src:  'assets/audio/vo/SLD-CC01-008-2.mp3',  // no leading ../
  endCue: '../assets/audio/vo/Click_The_Next_Button_To_Continue.mp3' // with ../
}, '*');
```

### File case sensitivity

Asset filenames are **case-sensitive on Linux / SCORM Cloud servers** even though Windows is case-insensitive. Always match case exactly.

```
Wrong:  Ptech-customer14.webp
Correct: PTech-customer14.webp
```

---

## 10. SCORM Packaging

### Sync files before packaging

Changes to `course/slides/` do NOT automatically appear in `output/course/slides/`. You must copy them manually before building the zip:

```bash
cp course/slides/SLD-CC01-XXX.html output/course/slides/SLD-CC01-XXX.html
```

And for runtime changes (apply logic manually, never raw copy — see §1):
```bash
# Do NOT: cp course/runtime.js output/course/player/runtime.js
# Instead: cherry-pick only the changed logic, preserving ../  paths
```

### Building the zip

Use Python to create the zip from `output/course/`. Always **exclude hidden directories** (`.claude`, `.git`, etc.) — they end up inside `output/course/` from Claude Code sessions and will pollute the package:

```python
import zipfile, pathlib

course_dir = pathlib.Path('course')
with zipfile.ZipFile('porsche-cc01-scorm.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for filepath in sorted(course_dir.rglob('*')):
        if filepath.is_file():
            arcname = filepath.relative_to(course_dir)
            # Skip hidden dirs (.claude, .git, etc.)
            if any(p.startswith('.') for p in arcname.parts):
                continue
            zf.write(filepath, arcname)
```

Run from `output/` directory. `imsmanifest.xml` must appear at the zip root (not inside a subdirectory).

### Testing before upload

| Command | URL | What it tests |
|---|---|---|
| `npm run start-player` | `http://localhost:8080` | Dev player (`course/`) — uses `./` paths |
| `npm run test-scorm` | `http://localhost:8081` | SCORM player (`output/course/`) — uses `../` paths |

**Important:** Testing on `:8080` (dev player) does NOT validate the SCORM player paths. Always test on `:8081` (or upload to SCORM Cloud) before declaring done.

### Blank screen diagnostic

If SCORM Cloud shows a blank screen:
1. Open browser DevTools on the launched content page
2. Check the console for `"Player init failed"` — this means `fetch("../data/course.data.json")` returned a 404
3. Most likely cause: `player/runtime.js` has `./` paths instead of `../` (see §1)
4. Second most likely: the zip structure is wrong — `imsmanifest.xml` must be at root, not inside a subdirectory

---

## 11. New Slide Checklist

Use this for every new slide.

### Required boilerplate

- [ ] `@font-face` declarations for Porsche Next TT (regular + bold)
- [ ] `:root` CSS variables (`--bg-0`, `--accent`, etc.)
- [ ] `.slide` at 1920 × 920px, `overflow: hidden`
- [ ] Scale-to-viewport script (inline, before other scripts)
- [ ] GSAP `<script src="../assets/vendor/gsap/gsap.min.js"></script>`
- [ ] Player compat shim (inline `<script>` block — copy from any existing slide)
- [ ] `player-play-state` message listener (pause/resume GSAP + CSS animations)

### Hard rules

- [ ] **NO Continue button.** The Next button is on the Player chrome, not the slide.
- [ ] All asset paths use `../assets/` prefix from slide location
- [ ] Slide ID in `data-slide-id` attribute on `.slide` element (KC slides also need `data-review-slide`)
- [ ] Filenames: hyphens only, no underscores. Match case exactly.

### Audio / Next button

- [ ] If slide has VO audio: does it need Next locked until VO ends? (If yes: runtime handles `nextLockedByAudio` automatically — no extra code needed)
- [ ] If slide has user interactions required before Next: add `sandbox-lock-next` on load, `sandbox-unlock-next` when complete
- [ ] If slide needs a "Click Next to continue" audio cue at the end: use `SandboxRuntime.voAudio.addEventListener('ended', ...)` for standard single-VO slides, or `endCue` parameter on `sandbox-swap-audio` for two-part VO slides
- [ ] If slide uses `sandbox-swap-audio`: do NOT rely on `SandboxRuntime.voAudio.addEventListener('ended', ...)` for post-swap logic — it won't fire reliably. Use `endCue` instead.

### Interactions

- [ ] If cards/buttons should be inactive until VO ends: add `pointer-events: none; opacity: 0` CSS to the interactive element, then add `.is-unlocked` class in the `voAudio.ended` handler
- [ ] Guard all interaction functions with a `completed` flag so double-clicks / keyboard repeats don't re-trigger

### GSAP

- [ ] If an element has both an entrance AND an exit tween: add `overwrite: true` to the exit tween
- [ ] Set initial hidden state for GSAP-controlled elements via `gsap.set()` not CSS

### Video

- [ ] Always set `vid.currentTime = 0` before `vid.play()` — browser caches last position across reloads
- [ ] If playing from frame 0: WebM is fine
- [ ] If seeking to a mid-clip start point: use `.mp4` only — WebM freezes on seek in SCORM Cloud iframes
- [ ] If looping a specific portion: use `loadedmetadata` → seek + `seeked` (once) → play pattern (mp4 only)
- [ ] `muted playsinline loop` attributes required for autoplay in all browsers

### Testing

- [ ] `npm run start-player` — test in dev player
- [ ] Check at 1.5× and 2× speed — do entrance/exit tweens still work correctly?
- [ ] Check all image filenames match case exactly (compare to actual files on disk)
- [ ] Test Next button: does it unlock at the right time? Does it stay locked during required interactions?

---

*Last updated: 2026-02-27 — added §6a–6c WebM/MP4 guidance; added §10 SCORM Packaging (two-runtime path issue, blank screen diagnostic, zip build script); renumbered §11 checklist*
