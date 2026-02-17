from __future__ import annotations
from pathlib import Path
import shutil
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape


def build_player_index(player_index_path: Path, course_title: str, project_root: Path) -> None:
    player_index_path.parent.mkdir(parents=True, exist_ok=True)

    env = Environment(
        loader=FileSystemLoader(str(project_root)),
        autoescape=select_autoescape(enabled_extensions=("html", "xml")),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )

    template = env.get_template("templates/player/index.html.j2")
    html = template.render(course_title=course_title)
    player_index_path.write_text(html, encoding="utf-8")

    cue_studio_template = env.get_template("templates/player/cue-studio.html.j2")
    cue_studio_html = cue_studio_template.render(course_title=course_title)
    (player_index_path.parent / "cue-studio.html").write_text(cue_studio_html, encoding="utf-8")

    src_runtime = project_root / "templates" / "player" / "runtime.js"
    if not src_runtime.exists():
        raise FileNotFoundError(f"Missing runtime source: {src_runtime}")

    shutil.copy2(src_runtime, player_index_path.parent / "runtime.js")

    src_cue_studio = project_root / "templates" / "player" / "cue-studio.js"
    if not src_cue_studio.exists():
        raise FileNotFoundError(f"Missing cue studio source: {src_cue_studio}")

    shutil.copy2(src_cue_studio, player_index_path.parent / "cue-studio.js")
