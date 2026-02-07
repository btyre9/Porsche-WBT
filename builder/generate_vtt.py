from __future__ import annotations
from pathlib import Path


def _ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h = ms // 3_600_000
    ms %= 3_600_000
    m = ms // 60_000
    ms %= 60_000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def write_text_vtt(slide_id: str, text: str, output_vtt: Path, duration_sec: float = 5.0) -> None:
    output_vtt.parent.mkdir(parents=True, exist_ok=True)
    safe_text = (text or f"{slide_id} caption placeholder").strip()
    output_vtt.write_text(
        "WEBVTT\n\n"
        f"{_ts(0)} --> {_ts(duration_sec)}\n"
        f"{safe_text}\n",
        encoding="utf-8",
    )


def transcribe_to_vtt(
    audio_path: Path,
    output_vtt: Path,
    model_size: str = "small",
    language: str = "en",
) -> bool:
    output_vtt.parent.mkdir(parents=True, exist_ok=True)

    if not audio_path.exists():
        write_text_vtt(audio_path.stem, "Audio file missing.", output_vtt)
        return False

    try:
        from faster_whisper import WhisperModel
    except Exception:
        write_text_vtt(audio_path.stem, "Install faster-whisper for real captions.", output_vtt)
        return False

    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(str(audio_path), language=language, vad_filter=True)
        rows = list(segments)
        if not rows:
            write_text_vtt(audio_path.stem, "No speech detected.", output_vtt)
            return False

        lines = ["WEBVTT", ""]
        for seg in rows:
            lines.append(f"{_ts(seg.start)} --> {_ts(seg.end)}")
            lines.append(seg.text.strip())
            lines.append("")
        output_vtt.write_text("\n".join(lines), encoding="utf-8")
        return True
    except Exception:
        write_text_vtt(audio_path.stem, "Transcription failed.", output_vtt)
        return False
