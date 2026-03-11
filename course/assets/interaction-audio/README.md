# Interaction Audio Maps

Use this folder for click/interaction-triggered voiceover clips.

Each slide can define a JSON map:

- `assets/interaction-audio/slide-CC01_SLD_004.json`

Supported shape:

```json
{
  "clips": {
    "ins-topics-1-click-technical-expertise": { "src": "assets/audio/vo/CC01_SLD_004.mp3", "start": 2.0, "end": 8.1 },
    "ins-topics-2-click-professionalism": { "src": "assets/audio/vo/CC01_SLD_004.mp3", "start": 8.2, "end": 14.5 }
  }
}
```

Clip fields:

- `src`: relative path from project root (same style as `audio_vo`).
- `start`: start time in seconds.
- `end`: end time in seconds.
- `pauseNarration` (optional, default `true`): pause main slide narration while clip plays.
- `resumeNarration` (optional, default `true`): resume narration after clip ends.
- `volume` (optional): `0..1`.
- `playbackRate` (optional): playback speed.

Runtime API available to slide scripts:

- `window.parent.CourseRuntime.playInteractionClip("ins-topics-1-click-technical-expertise")`
- `window.parent.CourseRuntime.playInteractionAudio({ src, start, end })`
- `window.parent.CourseRuntime.stopInteractionAudio()`
