from __future__ import annotations
from pathlib import Path


def write_scorm_manifest(manifest_path: Path, course_id: str, title: str) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{course_id}" version="1.0">
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>{title}</title>
      <item identifier="ITEM1" identifierref="RES1">
        <title>{title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" href="player/index.html">
      <file href="player/index.html"/>
    </resource>
  </resources>
</manifest>""",
        encoding="utf-8",
    )
