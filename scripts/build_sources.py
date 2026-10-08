#!/usr/bin/env python3
"""Convert paper/main.bib into website/assets/js/sources.js.

The website never parses BibTeX itself. This script does it once, resolves a
clickable link for every entry, and writes a plain script that sets
``window.SOURCES`` (a plain script, not a module, so the site keeps working
when index.html is opened straight from disk).

Link resolution order per entry:
  1. website/data/source-links.json   (manual overrides and fills)
  2. doi   -> https://doi.org/<doi>
  3. url
  4. an arXiv id found in howpublished/note -> https://arxiv.org/abs/<id>

Group headings come from the bibliography's own comment dividers, e.g.
``% ------------------- Part 1.1: Training data -------------------``.

Usage:
  python3 website/scripts/build_sources.py            # regenerate sources.js
  python3 website/scripts/build_sources.py --check    # also probe every link
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

WEBSITE = Path(__file__).resolve().parent.parent
ROOT = WEBSITE.parent
BIB = ROOT / "paper" / "main.bib"
OVERRIDES = WEBSITE / "data" / "source-links.json"
OUT = WEBSITE / "assets" / "js" / "sources.js"

ACCENTS = {
    "'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303",
    "v": "\u030c", "c": "\u0327", "u": "\u0306", "=": "\u0304", ".": "\u0307",
    "H": "\u030b", "k": "\u0328",
}
SYMBOLS = {"o": "ø", "O": "Ø", "ss": "ß", "aa": "å", "AA": "Å", "ae": "æ", "l": "ł", "L": "Ł"}
ARXIV = re.compile(r"arXiv:\s*(\d{4}\.\d{4,5})", re.I)
NOTE_LINK = re.compile(r"(Code|Tool|Calculator):\s*(https?://\S+)")


def latex_to_text(s: str) -> str:
    """Best-effort LaTeX to Unicode for the subset used in bibliographies."""

    def accent(m: re.Match) -> str:
        mark, base = m.group(1), m.group(2)
        base = "i" if base == "\\i" else base
        return unicodedata.normalize("NFC", base + ACCENTS[mark])

    # \'{a}, \'a, \v{r}, {\"\i}
    s = re.sub(r"\\([`'^\"~=.])\s*\{?(\\i|[A-Za-z])\}?", accent, s)
    s = re.sub(r"\\([vcuHk])\s*\{(\\i|[A-Za-z])\}", accent, s)
    s = re.sub(r"\\([vcuHk])\s+(\\i|[A-Za-z])", accent, s)
    s = re.sub(r"\\(ss|aa|AA|ae|o|O|l|L)\b\s*", lambda m: SYMBOLS[m.group(1)], s)
    s = s.replace("\\i", "i")
    s = s.replace("{,}", ",")
    # A tilde before a number is used as "approximately" in these notes.
    s = re.sub(r"~\s*(?=\\?\$|\d)", "≈", s)
    s = s.replace("~", "\u00a0")
    for tex, text in (("---", "\u2014"), ("--", "\u2013"), ("``", "\u201c"), ("''", "\u201d"),
                      ("\\&", "&"), ("\\%", "%"), ("\\$", "$"), ("\\_", "_"), ("\\,", "\u2009")):
        s = s.replace(tex, text)
    s = re.sub(r"\\[a-zA-Z]+\s*", "", s)  # drop any remaining commands
    s = s.replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", s).strip()


def read_value(text: str, i: int) -> tuple[str, int]:
    """Read one field value starting at text[i]; returns (raw value, next index)."""
    if text[i] == "{":
        depth, j = 0, i
        while True:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    return text[i + 1:j], j + 1
            j += 1
    if text[i] == '"':
        j = text.index('"', i + 1)
        return text[i + 1:j], j + 1
    m = re.match(r"[^,}\s]+", text[i:])
    return m.group(0), i + m.end()


def parse_bib(text: str) -> tuple[list[dict], list[dict]]:
    """Return (groups, entries) in file order."""
    groups: list[dict] = []
    entries: list[dict] = []
    current = None
    i = 0
    header = re.compile(r"^%\s*-{3,}\s*(.+?)\s*-{3,}\s*$", re.M)
    start = re.compile(r"@(\w+)\s*\{\s*([^,\s]+)\s*,")
    tokens = sorted(
        [(m.start(), "group", m) for m in header.finditer(text)]
        + [(m.start(), "entry", m) for m in start.finditer(text)],
        key=lambda t: t[0],
    )
    for pos, kind, m in tokens:
        if pos < i:
            continue
        if kind == "group":
            label = m.group(1)
            part = None
            pm = re.match(r"Part\s+([\d.]+):\s*(.+)", label)
            if pm:
                part, label = pm.group(1), pm.group(2)
            current = {"id": re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-"),
                       "part": part, "label": label, "keys": []}
            groups.append(current)
            continue
        etype, key = m.group(1).lower(), m.group(2)
        j = m.end()
        fields: dict[str, str] = {}
        while True:
            fm = re.compile(r"\s*,?\s*(\w+)\s*=\s*").match(text, j)
            if not fm:
                break
            value, j = read_value(text, fm.end())
            fields[fm.group(1).lower()] = value
        close = text.index("}", j)
        i = close + 1
        entries.append({"type": etype, "key": key, "fields": fields,
                        "group": current["id"] if current else None})
        if current:
            current["keys"].append(key)
    return groups, entries


def split_authors(raw: str) -> list[str]:
    names = [n.strip() for n in re.split(r"\s+and\s+", raw) if n.strip()]
    out = []
    for n in names:
        if n == "others":
            out.append("others")
        elif n.startswith("{") and n.endswith("}"):
            out.append(latex_to_text(n))
        elif "," in n:
            last, first = [p.strip() for p in n.split(",", 1)]
            initials = " ".join(p[0] + "." for p in re.split(r"[\s~]+", latex_to_text(first)) if p)
            out.append(f"{latex_to_text(last)}, {initials}")
        else:
            out.append(latex_to_text(n))
    return out


def author_line(authors: list[str]) -> str:
    etal = "others" in authors
    names = [a for a in authors if a != "others"]
    if len(names) > 3:
        names, etal = names[:3], True
    text = "; ".join(names)
    return f"{text}; et al." if etal and text else text


def short_label(authors: list[str], year: str | None, title: str) -> str:
    names = [a for a in authors if a != "others"]
    if not names:
        head = title.split(":")[0]
        if len(head) > 28:
            head = " ".join(head.split()[:3]) + "…"
    else:
        head = names[0].split(",")[0]
        if len(names) == 2 and "others" not in authors:
            head += " & " + names[1].split(",")[0]
        elif len(names) > 1 or "others" in authors:
            head += " et al."
    return f"{head}, {year}" if year else head


def venue_line(e: dict) -> str:
    f = e["fields"]
    parts = []
    for key in ("journal", "booktitle", "howpublished", "institution", "organization", "series"):
        if key in f:
            parts.append(latex_to_text(f[key]))
            break
    if "volume" in f:
        parts.append(f"vol. {latex_to_text(f['volume'])}")
    if "number" in f:
        parts.append(f"no. {latex_to_text(f['number'])}")
    if "pages" in f:
        parts.append(f"pp. {latex_to_text(f['pages'])}")
    return ", ".join(parts)


def resolve(e: dict, overrides: dict) -> tuple[str | None, list[dict]]:
    f = e["fields"]
    blob = " ".join(f.get(k, "") for k in ("howpublished", "note"))
    arxiv = ARXIV.search(blob)
    extra = []
    if "doi" in f and arxiv:
        extra.append({"label": "arXiv preprint", "url": f"https://arxiv.org/abs/{arxiv.group(1)}"})
    for label, url in NOTE_LINK.findall(f.get("note", "")):
        extra.append({"label": label, "url": url.rstrip(".,")})
    if e["key"] in overrides:
        return overrides[e["key"]], extra
    if "doi" in f:
        return f"https://doi.org/{f['doi']}", extra
    if "url" in f:
        return f["url"], extra
    if arxiv:
        return f"https://arxiv.org/abs/{arxiv.group(1)}", extra
    return None, extra


def build() -> dict:
    groups, raw_entries = parse_bib(BIB.read_text(encoding="utf-8"))
    overrides = {k: v for k, v in json.loads(OVERRIDES.read_text()).items() if not k.startswith("_")}
    entries = {}
    for e in raw_entries:
        f = e["fields"]
        authors = split_authors(f.get("author", ""))
        title = latex_to_text(f.get("title", e["key"]))
        year = f.get("year")
        url, extra = resolve(e, overrides)
        note = latex_to_text(f["note"]) if "note" in f else None
        if note and ("TODO" in note or NOTE_LINK.search(f["note"]) or note.startswith("Preprint")):
            note = None  # internal reminders and links already surfaced as buttons
        entries[e["key"]] = {
            "key": e["key"],
            "type": e["type"],
            "authors": author_line(authors),
            "label": short_label(authors, year, title),
            "title": title,
            "venue": venue_line(e),
            "year": year,
            "doi": f.get("doi"),
            "url": url,
            "links": extra,
            "note": note,
            "group": e["group"],
        }
    return {"groups": groups, "entries": entries}


def check_links(data: dict) -> int:
    bad = 0
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                             "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
    for key, e in data["entries"].items():
        for url in [e["url"]] + [link["url"] for link in e["links"]]:
            if not url:
                print(f"  MISSING  {key}")
                bad += 1
                continue
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=15) as r:
                    status = r.status
            except urllib.error.HTTPError as err:
                status = err.code
            except Exception as err:  # noqa: BLE001 - report any network failure
                status = type(err).__name__
            flag = "ok      " if status == 200 else "CHECK   "
            bad += status != 200
            print(f"  {flag} {status!s:>4}  {key:28} {url}")
    return bad


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="probe every resolved link over the network")
    args = ap.parse_args()
    data = build()
    OUT.write_text(
        "/* Generated by website/scripts/build_sources.py from paper/main.bib. Do not edit by hand. */\n"
        "window.SOURCES = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    missing = [k for k, e in data["entries"].items() if not e["url"]]
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(data['entries'])} sources in {len(data['groups'])} groups.")
    if missing:
        print("No link for: " + ", ".join(missing) + "  (add them to website/data/source-links.json)")
    if args.check:
        print("Checking links (some publishers refuse scripted requests; verify those in a browser):")
        return 1 if check_links(data) else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
