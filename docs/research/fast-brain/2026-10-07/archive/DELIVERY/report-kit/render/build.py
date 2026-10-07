#!/usr/bin/env python3
"""Build the SynAmp Fast-Brain dossier HTML from chapter sources.

Usage:
  python3 build.py [--out preview.html] [--exec W6-exec-summary.md]
Reads:   report-sources/W{1..5}*.md, report-sources/figures/*.svg, render/template.html
Writes:  the output HTML (single self-contained file, no external assets).
"""
import argparse, re, sys
from pathlib import Path
import markdown

HERE = Path(__file__).resolve().parent
TASK = HERE.parent                      # .cluster/synamp-fast-brain
SRC = TASK / "report-sources"
FIGS = SRC / "figures"

CHAPTERS = [
    dict(id="ch1", no="01", title="Words in, music out — the translation layer",
         file="W1-ch1-translation.md", marker="# 1 — Words in, music out"),
    dict(id="ch2", no="02", title="The fast learning brain",
         file="W2-ch2-learning.md", marker="# Chapter 2 — The fast learning brain"),
    dict(id="ch3", no="03", title="Bias, culture, and measurement honesty",
         file="W3-ch3-bias.md", marker="## Chapter 3 — Bias, culture, and measurement honesty"),
    dict(id="ch4", no="04", title="Verification, rollback, and handoff",
         file="W4-ch4-verification.md", marker="# Chapter 4 — Verification, rollback, and handoff"),
    dict(id="ch5", no="05", title="Appendix — sources, parameters, glossary",
         file="W5-ch5-appendix.md", marker="# Chapter 5 — Appendix"),
]

FIG_ORDER = {  # appearance order → figure number
    "flow": 1, "epochs": 2, "modules": 3, "reliability": 4,
}
FIG_CAPTIONS = {
    "flow": "From your words to your queue — and the loop that learns back, within this session only.",
    "epochs": "Three days of listening: what a session is, what stays inside it, and what must ask before crossing.",
    "reliability": "Measurement honesty: which fields are trusted, which are gated, and why unknown is never zero.",
    "modules": "The new library: intent, learning, sequencing — and where every test lives.",
}

def extract_body(text: str, marker: str, name: str) -> str:
    idx = text.find("\n" + marker)
    if idx < 0:
        if text.startswith(marker):
            idx = -1
        else:
            raise SystemExit(f"[build] marker not found in {name}: {marker!r}")
    body = text[idx + 1:] if idx >= 0 else text
    # drop the marker heading line itself (first line)
    lines = body.split("\n")
    lines = lines[1:]
    while lines and not lines[0].strip():
        lines = lines[1:]
    return "\n".join(lines)

FIG_RE = re.compile(r"\[FIGURE:\s*([a-z]+)\s*\]")

def figure_html(fig_id: str) -> str:
    svg = (FIGS / f"{fig_id}.svg").read_text(encoding="utf-8")
    svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg, count=1).strip()
    n = FIG_ORDER.get(fig_id, 0)
    cap = FIG_CAPTIONS.get(fig_id, "")
    return (
        f'\n<figure class="plate" id="fig-{fig_id}">\n{svg}\n'
        f'<figcaption><span class="fig-no">Figure {n} ·</span> {cap}</figcaption>\n</figure>\n'
    )

def convert(md_text: str, name: str) -> str:
    md_text = FIG_RE.sub(lambda m: figure_html(m.group(1)), md_text)
    html = markdown.markdown(md_text, extensions=["tables", "fenced_code", "sane_lists"])
    # Source-ID tables: keep the first column from wrapping mid-token (MP-1 / CC-47).
    def mark_ids(m):
        block = m.group(0)
        if any(k in block[:700] for k in ("MP-", "CC-", "ML-")):
            return '<table class="ids">' + block[len("<table>"):]
        return block
    html = re.sub(r"<table>.*?</table>", mark_ids, html, flags=re.S)
    missing = [f for f in FIG_ORDER if f not in {m.group(1) for m in FIG_RE.finditer(md_text)} and f"fig-{f}" not in html]
    if missing:
        print(f"[build] note: figures not referenced in {name}: {missing}")
    return html

def chapter_html(ch: dict) -> str:
    text = (SRC / ch["file"]).read_text(encoding="utf-8")
    body = extract_body(text, ch["marker"], ch["file"])
    inner = convert(body, ch["file"])
    head = (f'<header class="chapter__head"><p class="chapter__no">{ch["no"]} · Chapter</p>'
            f'<h1 class="chapter__title">{ch["title"]}</h1></header>')
    return head + "\n" + inner

def exec_html(path):
    if path and Path(path).exists():
        text = Path(path).read_text(encoding="utf-8")
        for marker in ("# Executive summary", "# Executive Summary", "# W6"):
            if marker in text:
                return convert(extract_body(text, marker, "W6"), "W6")
        # fallback: strip an optional preamble before the first --- separator
        parts = text.split("\n---\n", 1)
        body = parts[1] if len(parts) == 2 else text
        return convert(body, "W6")
    return '<p class="muted">[Executive summary pending final assembly.]</p>'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "preview.html"))
    ap.add_argument("--exec", default=str(SRC / "W6-exec-summary.md"))
    ap.add_argument("--status", default="Verified slice · reviews closed · frozen manifest at delivery")
    args = ap.parse_args()

    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    repl = {
        "{{DATE}}": "2026-10-07",
        "{{STATUS}}": args.status,
        "{{EXEC}}": exec_html(args.exec),
        "{{COLOPHON}}": (
            "<strong>Colophon.</strong> Assembled by the SynAmp agent cluster from research packs A1–A4, "
            "engineering receipts B1–B6/H1–H5, and independent reviews C1–C4; rendered as a single "
            "self-contained HTML file (no external assets, no scripts). Counts and checksums are frozen "
            "in the delivery manifest under <code>verification/</code>."
        ),
    }
    for ch in CHAPTERS:
        repl["{{" + ch["id"].upper() + "}}"] = chapter_html(ch)

    out = tpl
    for k, v in repl.items():
        out = out.replace(k, v)
    leftovers = re.findall(r"\{\{[A-Z0-9_]+\}\}", out)
    if leftovers:
        print(f"[build] WARNING leftover placeholders: {leftovers}")
    Path(args.out).write_text(out, encoding="utf-8")

    figs = out.count('<figure class="plate"')
    tbls = out.count("<table>")
    titles = out.count('class="chapter__title"') + out.count('class="chapter__no">00')
    print(f"[build] wrote {args.out} ({len(out):,} bytes) · chapters={titles} · figures={figs} · tables={tbls}")

if __name__ == "__main__":
    main()
