from __future__ import annotations
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape


def _env(project_root: Path) -> Environment:
    return Environment(
        loader=FileSystemLoader(str(project_root)),
        autoescape=select_autoescape(enabled_extensions=("html", "xml")),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render_slide_html(
    slide: dict,
    template_rel_path: str,
    project_root: Path,
    output_file: Path,
    course: dict,
) -> None:
    env = _env(project_root)
    template = env.get_template(template_rel_path)
    html = template.render(slide=slide, course=course)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(html, encoding="utf-8")
