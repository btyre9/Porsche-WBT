# Component Contract (Figma -> Slide Runtime)

Use this contract so Figma components map cleanly to reusable HTML components, cue animation, and click-triggered audio.

## 1) Naming Rules

- Component ID (code + docs): `cmp-<domain>-<name>`
- Instance ID (per slide): `ins-<purpose>-<n>`
- Animation key: `<instance>.<part>`
- Interaction audio clip ID: `<instance>-<event>-<target>`

Example:

- `cmp-topic-card`
- `ins-topics-1`
- `ins-topics-1.title`
- `ins-topics-1-click-technical-expertise`

## 2) Figma -> Code Mapping

- Figma component set name: `Topic Card`
- Figma variant props: `state=default|active`, `size=md|lg`
- Code files:
  - `templates/components/topic-card.html`
  - `templates/components/topic-card.css`
  - `templates/components/topic-card.js`

Keep Figma naming stable. Do not rename variant props after code integration.

## 3) Required HTML Contract

```html
<section
  data-component-id="cmp-topic-card"
  data-instance-id="ins-topics-1"
  data-vo-cues="true"
>
  <button
    class="topic-card"
    data-anim-key="ins-topics-1.card"
    data-action="topic-click"
    data-topic-id="technical-expertise"
  >
    <h3 data-anim-key="ins-topics-1.title">Technical Expertise</h3>
    <p data-anim-key="ins-topics-1.body">Gold-level diagnostics...</p>
  </button>
</section>
```

Rules:

- Every animatable part must have `data-anim-key`.
- `data-anim-key` must be unique within a slide.
- Use the instance prefix to avoid collisions.

## 4) Animation Cue Contract

File:

- `assets/animation-cues/slide-CC01_SLD_004.json`

Use `target` with the exact `data-anim-key`:

```json
{
  "version": 1,
  "followVoiceover": true,
  "cues": [
    { "at": 1.2, "target": "ins-topics-1.title", "action": "in", "preset": "fadeUp", "duration": 0.5 },
    { "at": 4.2, "target": "ins-topics-1.body", "action": "in", "preset": "fade", "duration": 0.4 }
  ]
}
```

## 5) Interaction Audio Contract

File:

- `assets/interaction-audio/slide-CC01_SLD_004.json`

Clip IDs should match interaction intent:

```json
{
  "clips": {
    "ins-topics-1-click-technical-expertise": {
      "src": "assets/audio/vo/CC01_SLD_004_technical-expertise.mp3"
    }
  }
}
```

Trigger from component JS:

```js
window.parent.CourseRuntime.playInteractionClip("ins-topics-1-click-technical-expertise");
```

## 6) Reuse Checklist

- Component has stable `component-id`.
- Every animated element has stable `data-anim-key`.
- Click events map to stable clip IDs.
- Figma variant names match code state names.
- No hardcoded timing in component JS (timing stays in cue/audio JSON).

## 7) Anti-Patterns

- Reusing generic keys like `title`, `subtitle` across multiple components on one slide.
- Storing animation timing in component JS.
- Mixing visual cue timing and interaction clip definitions in one JSON file.
- Renaming Figma variant props without updating code contract.
