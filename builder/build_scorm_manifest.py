from __future__ import annotations
from pathlib import Path
from xml.sax.saxutils import escape


def _collect_files(output_root: Path) -> list[str]:
    """Return sorted relative paths of all files under output_root (POSIX-style)."""
    skip_prefixes = (".", "__")
    files: list[str] = []
    for p in sorted(output_root.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(output_root).as_posix()
        if rel == "imsmanifest.xml":
            continue
        # Skip hidden/system directories (e.g. .claude/)
        if any(part.startswith(skip_prefixes) for part in rel.split("/")):
            continue
        files.append(rel)
    return files


def write_scorm_manifest(
    manifest_path: Path,
    course_id: str,
    title: str,
    output_root: Path | None = None,
) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    if output_root is None:
        output_root = manifest_path.parent

    safe_title = escape(title)
    safe_id = escape(course_id)

    file_entries = _collect_files(output_root)
    file_lines = "\n".join(
        f'      <file href="{href}"/>' for href in file_entries
    )

    manifest_path.write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{safe_id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                       http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>{safe_title}</title>
      <item identifier="ITEM1" identifierref="RES1">
        <title>{safe_title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" adlcp:scormtype="sco" href="player/index.html">
{file_lines}
    </resource>
  </resources>
</manifest>""",
        encoding="utf-8",
    )
