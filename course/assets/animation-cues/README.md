# Voiceover Cue Sheets

Use cue sheets to animate slide elements in/out using the player voiceover timeline.

## 1) Enable cue mode in slide HTML

On the root slide section:

```html
<section data-slide-id="slide-CC01_SLD_001" data-vo-cues="true">
```

Mark elements you want to target:

```html
<h1 data-anim-key="title">...</h1>
<p data-anim-key="subtitle">...</p>
```

## 2) Create cue JSON

Add a file in this folder named after slide id:

- `assets/animation-cues/slide-CC01_SLD_001.json`

Minimal schema:

```json
{
  "version": 1,
  "followVoiceover": true,
  "cues": [
    { "at": 0.5, "target": "title", "action": "in", "preset": "fadeUp" },
    { "at": 3.2, "target": "subtitle", "action": "out", "preset": "fade" }
  ]
}
```

## 3) Cue fields

- `at` (seconds): trigger time.
- `target`: `data-anim-key` value.
- `selector`: optional CSS selector instead of `target`.
- `action`: `in`, `out`, `set`, `classAdd`, `classRemove`.
- `preset`: animation style. Supported: `fade`, `fadeUp`, `fadeDown`, `slideLeft`, `slideRight`, `scaleIn`, `scaleOut`.
- `duration`, `delay`, `stagger`, `ease`: optional GSAP timing overrides.
- `from`, `to`, `set`: optional GSAP var objects for custom motion.
- `className`: required when using `classAdd`/`classRemove`.

## Notes

- Cue mode falls back to standard intro animation if no cue file is found.
- Scrubbing/replay is supported: cues reset and re-run when audio time jumps backward.
- Cue clock uses player voiceover (`CourseRuntime.getAudioCurrentTime`) when available.
- In the player, click the `Cues` button in the top-right to capture timestamps, add cues, and copy/download JSON for the current slide.
