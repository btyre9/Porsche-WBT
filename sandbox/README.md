# Slide Sandbox

A complete design environment for creating and testing slides before promoting them to the Player.

## Workflow Overview

```
1. Storyboard parse → generates initial slides in sandbox
2. Design in sandbox → refine interactions, animations, test audio/captions
3. Promote to Player → final testing with full runtime
4. Package → SCORM export
```

## Quick Start

1. **Open the viewer**: Open `sandbox/index.html` in your browser
2. **Select a slide**: Use the dropdown or click "Slides" to see the list
3. **Edit and refresh**: Make changes to slide HTML, then click "Refresh"

## Folder Structure

```
sandbox/
├── index.html              # Sandbox viewer (open in browser)
├── sandbox-runtime.js      # Audio, captions, animation cue support
├── README.md               # This file
├── slides/                 # Work-in-progress slides
│   ├── _template.html      # Starter template
│   ├── SLD-CC01-001.html   # Slide files
│   └── ...
├── audio/
│   ├── vo/                 # Main voiceover per slide
│   │   ├── SLD-CC01-001.mp3
│   │   └── ...
│   └── interaction/        # Click-triggered audio clips
│       ├── SLD-CC01-004-technical-expertise.mp3
│       └── ...
├── captions/               # VTT caption files
│   ├── SLD-CC01-001.vtt
│   └── ...
└── animation-cues/         # Animation timing (JSON)
    ├── SLD-CC01-001.json
    └── ...
```

## Naming Convention

**Slide ID format**: `SLD-CC01-XXX`
- `SLD` = Slide prefix
- `CC01` = Course code (Customer Communications Module 1)
- `XXX` = Slide number (001, 002, etc.)

All associated files use the same ID:
- `SLD-CC01-004.html` (slide)
- `SLD-CC01-004.mp3` (voiceover)
- `SLD-CC01-004.vtt` (captions)
- `SLD-CC01-004.json` (animation cues)
- `SLD-CC01-004-topicname.mp3` (interaction audio)

## Creating a New Slide

1. Copy `slides/_template.html` to a new file (e.g., `slides/SLD-CC01-005.html`)
2. Update the slide ID in the template:
   - Change `data-slide-id="SLD-CC01-XXX"` to your slide ID
   - Update `SandboxRuntime.init('SLD-CC01-XXX', ...)` to your slide ID
3. Add it to the `slides` array in `index.html`
4. Create associated assets in the appropriate folders

## Sandbox Runtime Features

### Audio Playback

The runtime provides play/pause controls at the bottom of the slide:
- Play/pause button
- Progress bar (clickable to seek)
- Time display
- CC toggle for captions

### Captions

Create a VTT file in `captions/` with the slide ID:

```vtt
WEBVTT

00:00.000 --> 00:03.500
Welcome to this module on brand ambassadorship.

00:03.500 --> 00:07.000
As an elite technician, you represent Porsche.
```

### Animation Cues

Create a JSON file in `animation-cues/` to trigger animations at specific times:

```json
[
  { "time": 0.5, "target": ".slide-title", "animation": "fadeIn" },
  { "time": 2.0, "target": ".slide-content", "animation": "slideUp" },
  { "time": 4.5, "target": "#feature-card", "animation": "highlight" }
]
```

Available animations:
- `fadeIn` / `fadeOut`
- `slideUp` / `slideDown`
- `scaleIn`
- `highlight` (pulses a red glow)

### Interaction Audio

For click-triggered audio clips, use `playInteractionClip()`:

```javascript
document.querySelector('.my-button').addEventListener('click', () => {
  playInteractionClip('button-topic');
});
```

This plays: `audio/interaction/SLD-CC01-XXX-button-topic.mp3`

## Promoting to Player

When a slide is ready for the Player:

```bash
python builder/promote_sandbox_slide.py --slide SLD-CC01-004
```

This will:
1. Copy slide HTML → `templates/slides/prebuilt/slide-SLD-CC01-004.html`
2. Copy VO audio → `assets/audio/vo/`
3. Copy captions → `assets/audio/`
4. Copy animation cues → `assets/animation-cues/`
5. Copy interaction audio → `assets/interaction-audio/`
6. Update paths automatically

### Dry Run

Preview what will be copied without making changes:

```bash
python builder/promote_sandbox_slide.py --slide SLD-CC01-004 --dry-run
```

### Force Overwrite

Overwrite existing files in destination:

```bash
python builder/promote_sandbox_slide.py --slide SLD-CC01-004 --force
```

## Working with Assets

Slides in the sandbox reference shared assets using relative paths:

```html
<!-- Icons -->
<img src="../../assets/icons/user.svg">

<!-- Fonts (in CSS) -->
src: url('../../assets/fonts/porsche-next-tt.ttf')

<!-- GSAP -->
<script src="../../assets/vendor/gsap/gsap.min.js"></script>

<!-- Sandbox Runtime -->
<script src="../sandbox-runtime.js"></script>
```

## Tips

- **Slide dimensions**: Design for 1920x920px (the standard slide size)
- **Live editing**: Keep your editor and browser side by side
- **Use DevTools**: Right-click the slide iframe and "Inspect" to debug
- **Test interactions**: All click handlers, modals, etc. work in the sandbox
- **Console logs**: The sandbox runtime logs helpful messages to the console
