from __future__ import annotations
from pathlib import Path
import csv
import re


def apply_pronunciation_map(text: str, pron_map: dict[str, str]) -> str:
    out = text
    for src, dst in pron_map.items():
        out = re.sub(rf"\b{re.escape(src)}\b", dst, out)
    return out


def export_tts_csv(rows: list[dict[str, str]], output_csv: Path) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["slide_id", "voiceover_clean"])
        w.writeheader()
        w.writerows(rows)
