"""
Push sandbox slides to Player output.

Usage:
  python rebuild.py SLD-CC01-008   — one slide
  python rebuild.py                — all slides
"""
import re
import shutil
import sys
from pathlib import Path

ROOT       = Path(__file__).resolve().parent
SANDBOX    = ROOT / "sandbox"
OUT_SLIDES = ROOT / "output/course/slides"
OUT_ASSETS = ROOT / "output/course/assets"

# ── Player shim (replaces sandbox-runtime.js) ────────────────────────────────
PLAYER_SHIM = """\
<script>
/* Player compat shim */
(function () {
  var _tHandlers = [];
  var _eHandlers = [];
  var _lastTime = -1;
  var _wasPlaying = false;
  var _endedFired = false;

  function getCR() {
    try { return window.parent && window.parent.CourseRuntime; } catch (_) { return null; }
  }

  var fakeInteractionAudio = {
    src: '',
    play: function () {
      var cr = getCR();
      if (cr && this.src) cr.playInteractionAudio({ src: this.src });
      return Promise.resolve();
    },
    pause: function () {}
  };

  var fakeAudio = {
    get currentTime() { var cr = getCR(); return cr ? (cr.getAudioCurrentTime() || 0) : 0; },
    get duration()    { var cr = getCR(); return cr && cr.getAudioDuration ? (cr.getAudioDuration() || 0) : 0; },
    addEventListener: function (type, fn) {
      if (type === 'timeupdate') _tHandlers.push(fn);
      else if (type === 'ended') _eHandlers.push(fn);
    },
    removeEventListener: function () {}
  };

  window.SandboxRuntime = {
    voAudio: fakeAudio,
    interactionAudio: fakeInteractionAudio,
    init: function () {},
    playInteractionClip: function (id) { var cr = getCR(); if (cr) cr.playInteractionClip(id); }
  };

  function poll() {
    var cr = getCR();
    if (cr) {
      var t = cr.getAudioCurrentTime ? cr.getAudioCurrentTime() : 0;
      var playing = cr.isAudioPlaying ? cr.isAudioPlaying() : false;
      if (t !== _lastTime) {
        _lastTime = t;
        var e = { target: fakeAudio, type: 'timeupdate' };
        for (var i = 0; i < _tHandlers.length; i++) { try { _tHandlers[i](e); } catch (_e) {} }
      }
      if (_wasPlaying && !playing && !_endedFired && _eHandlers.length) {
        var dur = cr.getAudioDuration ? cr.getAudioDuration() : 0;
        if (dur > 0 && t >= dur - 0.5) {
          _endedFired = true;
          var ee = { target: fakeAudio, type: 'ended' };
          for (var j = 0; j < _eHandlers.length; j++) { try { _eHandlers[j](ee); } catch (_e) {} }
        }
      }
      _wasPlaying = playing;
      if (!playing && t === 0) _endedFired = false;
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);

  (function () {
    var styleInjected = false;
    function ensurePauseStyle() {
      if (styleInjected) return;
      styleInjected = true;
      var s = document.createElement('style');
      s.textContent = 'html.slide-paused * { animation-play-state: paused !important; }';
      document.head.appendChild(s);
    }
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'player-play-state') return;
      ensurePauseStyle();
      if (e.data.playing) {
        if (window.gsap) window.gsap.globalTimeline.resume();
        document.documentElement.classList.remove('slide-paused');
      } else {
        if (window.gsap) window.gsap.globalTimeline.pause();
        document.documentElement.classList.add('slide-paused');
      }
    });
  })();
})();
</script>"""

# ── Path rewrites (sandbox → player) ─────────────────────────────────────────
PATH_SUBS = [
    (r'\.\./audio/vo/',          '../assets/audio/vo/'),
    (r'\.\./audio/interaction/', '../assets/interaction-audio/'),
    (r'\.\./captions/',          '../assets/captions/'),
    (r'\.\./animation-cues/',    '../assets/animation-cues/'),
    (r'\.\./\.\./assets/',       '../assets/'),
]

# ── Sandbox asset dirs → output asset dirs ────────────────────────────────────
ASSET_MAP = {
    "audio/vo":          "audio/vo",
    "audio/interaction": "interaction-audio",
    "captions":          "captions",
    "animation-cues":    "animation-cues",
}

# ── Patterns to find referenced asset filenames in sandbox HTML ───────────────
REF_PATTERNS = [
    (r"""['"]\.\.\/audio\/vo\/([^'">\s]+)['"]""",          "audio/vo"),
    (r"""['"]\.\.\/audio\/interaction\/([^'">\s]+)['"]""", "audio/interaction"),
    (r"""['"]\.\.\/captions\/([^'">\s]+)['"]""",           "captions"),
    (r"""['"]\.\.\/animation-cues\/([^'">\s]+)['"]""",     "animation-cues"),
]


def transform(html, slide_id):
    # 1. Swap sandbox-runtime script tag for player shim
    html = re.sub(
        r'<script\s+src=["\'](?:\.\./)?sandbox-runtime\.js["\']>\s*</script>',
        PLAYER_SHIM,
        html
    )
    # 2. Rewrite asset paths
    for pattern, replacement in PATH_SUBS:
        html = re.sub(pattern, replacement, html)
    # 3. Remove SandboxRuntime.init() calls
    html = re.sub(r'SandboxRuntime\.init\([^)]*\);?\s*', '', html)
    return html


def copy_assets(raw_html, slide_id):
    copied = 0
    for pattern, sandbox_subdir in REF_PATTERNS:
        out_subdir = ASSET_MAP[sandbox_subdir]
        for filename in re.findall(pattern, raw_html):
            src = SANDBOX / sandbox_subdir / filename
            dst = OUT_ASSETS / out_subdir / filename
            if src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                print(f"  {filename}")
                copied += 1
            else:
                print(f"  (missing) {src.relative_to(ROOT)}")
    return copied


def promote(slide_id):
    src = SANDBOX / "slides" / f"{slide_id}.html"
    if not src.exists():
        print(f"  ERROR: not found: {src}")
        return

    raw = src.read_text(encoding="utf-8")
    out = OUT_SLIDES / f"{slide_id}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(transform(raw, slide_id), encoding="utf-8")
    print(f"  {slide_id}.html → output/course/slides/")

    copy_assets(raw, slide_id)


# ── Entry point ───────────────────────────────────────────────────────────────
slide = sys.argv[1] if len(sys.argv) > 1 else None

if slide:
    print(f"\nPromoting {slide}...")
    promote(slide)
else:
    slides = sorted((SANDBOX / "slides").glob("*.html"), key=lambda p: p.name)
    if not slides:
        print("No sandbox slides found.")
        sys.exit(1)
    for s in slides:
        print(f"\n→ {s.stem}")
        promote(s.stem)

print("\nDone.")
