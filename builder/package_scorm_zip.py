from __future__ import annotations

from argparse import ArgumentParser
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def _iter_files(output_root: Path) -> list[Path]:
    return sorted([p for p in output_root.rglob("*") if p.is_file()])


def package_scorm_zip(output_root: Path, zip_path: Path | None = None) -> Path:
    output_root = output_root.resolve()
    manifest = output_root / "imsmanifest.xml"
    if not output_root.exists():
        raise FileNotFoundError(f"Output root does not exist: {output_root}")
    if not manifest.exists():
        raise FileNotFoundError(f"SCORM manifest not found: {manifest}")

    if zip_path is None:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        zip_path = output_root.parent / f"{output_root.name}-scorm-{stamp}.zip"
    else:
        zip_path = zip_path.resolve()
        zip_path.parent.mkdir(parents=True, exist_ok=True)

    files = _iter_files(output_root)
    with ZipFile(zip_path, mode="w", compression=ZIP_DEFLATED) as zf:
        for path in files:
            arcname = path.relative_to(output_root).as_posix()
            zf.write(path, arcname=arcname)

    return zip_path


def main() -> None:
    parser = ArgumentParser(description="Package a built SCORM folder into a zip archive.")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "output" / "course",
        help="Path to built SCORM output folder (must contain imsmanifest.xml).",
    )
    parser.add_argument(
        "--zip-path",
        type=Path,
        default=None,
        help="Optional destination .zip path. If omitted, creates a timestamped zip next to output root.",
    )
    args = parser.parse_args()

    zip_file = package_scorm_zip(args.output_root, args.zip_path)
    print(f"SCORM package created: {zip_file}")


if __name__ == "__main__":
    main()
