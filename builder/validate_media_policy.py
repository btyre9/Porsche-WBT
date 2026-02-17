from __future__ import annotations

import argparse
from pathlib import Path


DISALLOWED_RASTER_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff"}
DISALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".m4v", ".mpg", ".mpeg"}


def collect_media_policy_violations(project_root: Path) -> list[str]:
    assets_root = project_root / "assets"
    if not assets_root.exists():
        return []

    violations: list[str] = []
    for src in assets_root.rglob("*"):
        if not src.is_file():
            continue

        ext = src.suffix.lower()
        rel = src.relative_to(project_root).as_posix()

        if ext in DISALLOWED_RASTER_IMAGE_EXTS:
            violations.append(f"{rel} -> convert to .webp")
        elif ext in DISALLOWED_VIDEO_EXTS:
            violations.append(f"{rel} -> convert to .webm")

    return violations


def enforce_media_format_policy(project_root: Path) -> None:
    violations = collect_media_policy_violations(project_root)
    if not violations:
        return

    joined = "\n  - ".join(violations)
    raise ValueError(
        "Media format policy violation. Use .webp for raster images and .webm for videos.\n"
        "Disallowed files:\n"
        f"  - {joined}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate media policy: raster images must be .webp and videos must be .webm."
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Path to project root.",
    )
    args = parser.parse_args()

    try:
        enforce_media_format_policy(args.project_root.resolve())
    except ValueError as exc:
        print(str(exc))
        return 1

    print("Media policy check: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
