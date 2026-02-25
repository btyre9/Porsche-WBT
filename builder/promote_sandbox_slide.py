"""
Promote Sandbox Slide to Player

Copies a slide and its associated assets from the sandbox to the Player structure.
Updates paths in the HTML to work with the Player runtime.

Usage:
    python builder/promote_sandbox_slide.py --slide SLD-CC01-004
    python builder/promote_sandbox_slide.py --slide SLD-CC01-004 --dry-run
    python builder/promote_sandbox_slide.py --slide SLD-CC01-004 --force
"""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path


# Player compat shim — injected in place of sandbox-runtime.js
# Creates window.SandboxRuntime with fake voAudio that polls CourseRuntime,
# and fake interactionAudio that delegates to CourseRuntime.playInteractionAudio.
_PLAYER_SHIM = """\
<script>
/* Player compat shim — replaces SandboxRuntime in promoted slides */
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
    get currentTime() {
      var cr = getCR();
      return cr ? (cr.getAudioCurrentTime() || 0) : 0;
    },
    get duration() {
      var cr = getCR();
      return cr && cr.getAudioDuration ? (cr.getAudioDuration() || 0) : 0;
    },
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
    playInteractionClip: function (id) {
      var cr = getCR(); if (cr) cr.playInteractionClip(id);
    }
  };

  function poll() {
    var cr = getCR();
    if (cr) {
      var t = cr.getAudioCurrentTime ? cr.getAudioCurrentTime() : 0;
      var playing = cr.isAudioPlaying ? cr.isAudioPlaying() : false;
      if (t !== _lastTime) {
        _lastTime = t;
        var e = { target: fakeAudio, type: 'timeupdate' };
        for (var i = 0; i < _tHandlers.length; i++) {
          try { _tHandlers[i](e); } catch (_e) {}
        }
      }
      if (_wasPlaying && !playing && !_endedFired && _eHandlers.length) {
        var dur = cr.getAudioDuration ? cr.getAudioDuration() : 0;
        if (dur > 0 && t >= dur - 0.5) {
          _endedFired = true;
          var ee = { target: fakeAudio, type: 'ended' };
          for (var j = 0; j < _eHandlers.length; j++) {
            try { _eHandlers[j](ee); } catch (_e) {}
          }
        }
      }
      _wasPlaying = playing;
      if (!playing && t === 0) _endedFired = false;
    }
    requestAnimationFrame(poll);
  }

  requestAnimationFrame(poll);

  // Listen for player-play-state to freeze/resume GSAP and CSS animations
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

# Path mappings: sandbox path -> player path
# Slides live at output/course/slides/ so assets are at ../assets/ relative to them.
PATH_MAPPINGS = [
    # Audio VO
    (r'\.\./audio/vo/', '../assets/audio/vo/'),
    (r'\.\.\/audio\/vo\/', '../assets/audio/vo/'),

    # Interaction audio
    (r'\.\./audio/interaction/', '../assets/interaction-audio/'),
    (r'\.\.\/audio\/interaction\/', '../assets/interaction-audio/'),

    # Captions
    (r'\.\./captions/', '../assets/audio/'),
    (r'\.\.\/captions\/', '../assets/audio/'),

    # Animation cues
    (r'\.\./animation-cues/', '../assets/animation-cues/'),
    (r'\.\.\/animation-cues\/', '../assets/animation-cues/'),

    # Shared assets (already correct relative path from prebuilt)
    (r'\.\./\.\./assets/', '../assets/'),
    (r'\.\.\/\.\.\/assets\/', '../assets/'),

    # Sandbox runtime -> Player compat shim (replaced by transform_html)
    (r'<script\s+src=["\'](?:\.\./)?sandbox-runtime\.js["\']>\s*</script>', _PLAYER_SHIM),
]

# Script replacements: sandbox init -> player compatible
SCRIPT_REPLACEMENTS = [
    # Remove SandboxRuntime.init() calls - Player handles this differently
    (r"SandboxRuntime\.init\([^)]*\);?\s*", ''),
    # Keep playInteractionClip calls but update to use parent runtime
    (r"playInteractionClip\(", 'window.parent?.CourseRuntime?.playInteractionClip('),
]


def get_project_root() -> Path:
    """Get project root directory."""
    return Path(__file__).resolve().parents[1]


def get_sandbox_paths(project_root: Path, slide_id: str) -> dict:
    """Get all sandbox paths for a slide."""
    sandbox = project_root / 'sandbox'
    return {
        'slide': sandbox / 'slides' / f'{slide_id}.html',
        'vo_audio': sandbox / 'audio' / 'vo' / f'{slide_id}.mp3',
        'captions': sandbox / 'captions' / f'{slide_id}.vtt',
        'animation_cues': sandbox / 'animation-cues' / f'{slide_id}.json',
        'interaction_audio_dir': sandbox / 'audio' / 'interaction',
    }


def get_player_paths(project_root: Path, slide_id: str) -> dict:
    """Get all player destination paths for a slide."""
    return {
        'slide': project_root / 'templates' / 'slides' / 'prebuilt' / f'{slide_id}.html',
        'vo_audio': project_root / 'assets' / 'audio' / 'vo' / f'{slide_id}.mp3',
        'captions': project_root / 'assets' / 'captions' / f'{slide_id}.vtt',
        'animation_cues': project_root / 'assets' / 'animation-cues' / f'{slide_id}.json',
        'interaction_audio_dir': project_root / 'assets' / 'interaction-audio',
    }


def find_interaction_audio_files(sandbox_dir: Path, slide_id: str) -> list[Path]:
    """Find all interaction audio files for a slide."""
    if not sandbox_dir.exists():
        return []

    files = []
    for f in sandbox_dir.glob(f'{slide_id}-*.mp3'):
        files.append(f)
    return files


def transform_html(html_content: str, slide_id: str) -> str:
    """Transform sandbox HTML to work with Player."""
    result = html_content

    # Apply path mappings
    for pattern, replacement in PATH_MAPPINGS:
        result = re.sub(pattern, replacement, result)

    # Apply script replacements
    for pattern, replacement in SCRIPT_REPLACEMENTS:
        result = re.sub(pattern, replacement, result)

    # Update data-slide-id if needed
    result = re.sub(
        r'data-slide-id="[^"]*"',
        f'data-slide-id="{slide_id}"',
        result
    )

    # Add data-vo-cues="true" if not present and VO audio exists
    if 'data-vo-cues' not in result:
        result = re.sub(
            r'(data-slide-id="[^"]*")',
            r'\1 data-vo-cues="true"',
            result
        )

    # Auto-inject "Click Next to continue" audio for SLD slides that don't
    # already have a custom interactionAudio.src handler.
    if slide_id.startswith('SLD-') and 'interactionAudio.src' not in result:
        inject = (
            '\n<script>\n'
            '/* Auto-injected: play click-next audio after VO completes */\n'
            "SandboxRuntime.voAudio.addEventListener('ended', function () {\n"
            "  SandboxRuntime.interactionAudio.src = '../assets/interaction-audio/SLD-CC01-002-next-button.mp3';\n"
            "  SandboxRuntime.interactionAudio.play().catch(function () {});\n"
            '});\n'
            '</script>\n'
        )
        result = result.replace('</body>', inject + '</body>', 1)

    return result


def copy_file(src: Path, dst: Path, dry_run: bool = False) -> bool:
    """Copy a file if source exists."""
    if not src.exists():
        return False

    if dry_run:
        print(f"  [DRY RUN] Would copy: {src.name} -> {dst}")
        return True

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"  Copied: {src.name} -> {dst}")
    return True


def promote_slide(
    slide_id: str,
    project_root: Path,
    dry_run: bool = False,
    force: bool = False
) -> None:
    """Promote a slide from sandbox to player."""

    sandbox_paths = get_sandbox_paths(project_root, slide_id)
    player_paths = get_player_paths(project_root, slide_id)

    # Check if slide exists
    if not sandbox_paths['slide'].exists():
        raise FileNotFoundError(f"Slide not found: {sandbox_paths['slide']}")

    # Check if destination exists
    if player_paths['slide'].exists() and not force:
        raise FileExistsError(
            f"Destination already exists: {player_paths['slide']}\n"
            f"Use --force to overwrite."
        )

    print(f"\nPromoting slide: {slide_id}")
    print("=" * 50)

    # 1. Transform and copy slide HTML
    print("\n1. Processing slide HTML...")
    html_content = sandbox_paths['slide'].read_text(encoding='utf-8')
    transformed_html = transform_html(html_content, slide_id)

    if dry_run:
        print(f"  [DRY RUN] Would write transformed HTML to: {player_paths['slide']}")
    else:
        player_paths['slide'].parent.mkdir(parents=True, exist_ok=True)
        player_paths['slide'].write_text(transformed_html, encoding='utf-8')
        print(f"  Wrote: {player_paths['slide']}")

    # 2. Copy VO audio (main clip + any slide sub-clips like SLD-CC01-004-*.mp3)
    print("\n2. Copying VO audio...")
    if not copy_file(sandbox_paths['vo_audio'], player_paths['vo_audio'], dry_run):
        print(f"  (No VO audio found at {sandbox_paths['vo_audio']})")
    vo_dir = sandbox_paths['vo_audio'].parent
    vo_dest_dir = player_paths['vo_audio'].parent
    for sub_clip in sorted(vo_dir.glob(f'{slide_id}-*.mp3')):
        copy_file(sub_clip, vo_dest_dir / sub_clip.name, dry_run)

    # 3. Copy captions
    print("\n3. Copying captions...")
    if not copy_file(sandbox_paths['captions'], player_paths['captions'], dry_run):
        print(f"  (No captions found at {sandbox_paths['captions']})")

    # 4. Copy animation cues
    print("\n4. Copying animation cues...")
    if not copy_file(sandbox_paths['animation_cues'], player_paths['animation_cues'], dry_run):
        print(f"  (No animation cues found at {sandbox_paths['animation_cues']})")

    # 5. Copy interaction audio files
    print("\n5. Copying interaction audio...")
    interaction_files = find_interaction_audio_files(
        sandbox_paths['interaction_audio_dir'],
        slide_id
    )
    if interaction_files:
        for src_file in interaction_files:
            dst_file = player_paths['interaction_audio_dir'] / src_file.name
            copy_file(src_file, dst_file, dry_run)
    else:
        print(f"  (No interaction audio files found for {slide_id})")

    print("\n" + "=" * 50)
    if dry_run:
        print("DRY RUN complete. No files were modified.")
    else:
        print(f"Slide {slide_id} promoted successfully!")
        print(f"\nNext steps:")
        print(f"  1. Update storyboard to reference: slide-{slide_id}")
        print(f"  2. Run: python builder/main.py")
        print(f"  3. Test in Player")


def main():
    parser = argparse.ArgumentParser(
        description="Promote a sandbox slide to the Player structure."
    )
    parser.add_argument(
        '--slide',
        required=True,
        help='Slide ID to promote (e.g., SLD-CC01-004)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without making changes'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Overwrite existing files in destination'
    )
    parser.add_argument(
        '--project-root',
        type=Path,
        default=None,
        help='Project root directory (default: auto-detect)'
    )

    args = parser.parse_args()

    project_root = args.project_root or get_project_root()

    try:
        promote_slide(
            slide_id=args.slide,
            project_root=project_root,
            dry_run=args.dry_run,
            force=args.force
        )
    except (FileNotFoundError, FileExistsError) as e:
        print(f"\nError: {e}")
        exit(1)


if __name__ == '__main__':
    main()
