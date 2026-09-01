#!/usr/bin/env python3
"""Build a 3D knowledge galaxy from a folder of markdown notes.

Scans every .md file under a notes folder and writes viewer/graph-data.js containing
`const GRAPH = {nodes: [...], links: [...]}`.

Standard library only — no pip installs, no build tools.

    python3 build.py                     # uses ./notes (seeds samples if empty)
    python3 build.py /path/to/vault      # uses your own vault
    python3 build.py --seed              # force-write the sample notes first

Every node's `id` is its index in the nodes array. The viewer and the server both
look nodes up by index, so this must stay true.
"""

import argparse
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_NOTES = os.path.join(HERE, "notes")
DEFAULT_OUT = os.path.join(HERE, "viewer", "graph-data.js")

EXCERPT_CHARS = 700
MIN_ALIAS_LEN = 4          # shorter titles match too much noise
SHARED_LINK_THRESHOLD = 3  # notes need 3+ common references to count as related

WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")
H1_RE = re.compile(r"^\s*#\s+(.+?)\s*$", re.MULTILINE)
CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)


def label_from_filename(path):
    """`green-bean-sourcing.md` -> `Green Bean Sourcing`."""
    stem = os.path.splitext(os.path.basename(path))[0]
    words = re.split(r"[-_\s]+", stem.strip())
    out = []
    for word in words:
        if not word:
            continue
        # Keep things like "2026" and "P&L" as they are.
        out.append(word if (word.isupper() or word[0].isdigit()) else word.capitalize())
    return " ".join(out) or stem


def plain_text(markdown):
    """Strip the markdown down to something worth reading in a side panel."""
    text = CODE_FENCE_RE.sub(" ", markdown)
    text = WIKILINK_RE.sub(lambda m: m.group(1), text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)          # images
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)        # links
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_`>]+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def make_excerpt(text, limit=EXCERPT_CHARS):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip(" ,;:.") + "…"


def iter_markdown(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for name in sorted(filenames):
            if name.lower().endswith(".md") and not name.startswith("."):
                yield os.path.join(dirpath, name)


def normalise(value):
    return re.sub(r"\s+", " ", value).strip().lower()


def read_note(path, root):
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        raw = fh.read()

    rel = os.path.relpath(path, root).replace(os.sep, "/")
    parent = os.path.dirname(rel)
    group = parent.split("/")[0] if parent else "root"

    from_filename = label_from_filename(path)
    heading = H1_RE.search(raw)
    body = plain_text(raw)

    # The filename is the label, unless the note opens with an H1 that says it better
    # (`monthly-pl-notes.md` really is "Monthly P&L Notes"). Both stay searchable.
    label = heading.group(1).strip() if heading else from_filename

    aliases = {normalise(label), normalise(from_filename)}
    aliases.add(normalise(os.path.splitext(os.path.basename(path))[0].replace("-", " ")))
    aliases = {a for a in aliases if len(a) >= MIN_ALIAS_LEN}

    return {
        "label": label,
        "group": group,
        "path": rel,
        "excerpt": make_excerpt(body),
        "words": len(body.split()),
        "wikilinks": [normalise(w) for w in WIKILINK_RE.findall(raw)],
        "_aliases": aliases,
        "_body": body.lower(),
        "_full": body,
    }


def build_graph(notes_dir):
    """Return {'nodes': [...], 'links': [...], ...} for a folder of markdown notes."""
    notes_dir = os.path.abspath(notes_dir)
    notes = [read_note(p, notes_dir) for p in iter_markdown(notes_dir)]
    notes.sort(key=lambda n: (n["group"], n["label"]))

    for index, note in enumerate(notes):
        note["id"] = index  # id == position in the array. Everything depends on this.

    # alias -> node index, for resolving [[wikilinks]] and title mentions
    alias_index = {}
    for note in notes:
        for alias in note["_aliases"]:
            alias_index.setdefault(alias, note["id"])

    # Pre-compile one matcher per alias so "unit economics" matches on word boundaries
    # and "cash" inside "cashier" does not.
    matchers = [
        (alias_index[alias], re.compile(r"\b" + re.escape(alias) + r"\b"))
        for alias in alias_index
    ]

    strength = {}

    def bump(a, b, amount):
        if a == b:
            return
        key = (min(a, b), max(a, b))
        strength[key] = strength.get(key, 0) + amount

    references = {}
    for note in notes:
        targets = set()
        for alias in note["wikilinks"]:
            if alias in alias_index:
                targets.add(alias_index[alias])
        for other_id, matcher in matchers:
            if other_id != note["id"] and matcher.search(note["_body"]):
                targets.add(other_id)
        targets.discard(note["id"])
        references[note["id"]] = targets
        for target in targets:
            bump(note["id"], target, 2)

    # Two notes that both point at the same handful of other notes are related even
    # when neither mentions the other.
    ids = [n["id"] for n in notes]
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            shared = references[a] & references[b]
            if len(shared) >= SHARED_LINK_THRESHOLD:
                key = (min(a, b), max(a, b))
                if key not in strength:
                    bump(a, b, 1)

    links = [
        {"source": a, "target": b, "value": value}
        for (a, b), value in sorted(strength.items())
    ]

    groups = sorted({n["group"] for n in notes})
    clean_nodes = [
        {
            "id": n["id"],
            "label": n["label"],
            "group": n["group"],
            "path": n["path"],
            "excerpt": n["excerpt"],
            "words": n["words"],
            "degree": sum(1 for l in links if n["id"] in (l["source"], l["target"])),
        }
        for n in notes
    ]

    return {
        "generated": datetime.datetime.now().replace(microsecond=0).isoformat(),
        "notesDir": notes_dir,
        "groups": groups,
        "nodes": clean_nodes,
        "links": links,
        # Full text stays server-side: it is what /chat retrieves against. It is
        # deliberately not written into graph-data.js.
        "_texts": [n["_full"] for n in notes],
    }


def write_graph_js(graph, out_path):
    payload = {k: v for k, v in graph.items() if not k.startswith("_")}
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("// Generated by build.py — do not edit by hand.\n")
        fh.write("// Regenerate with:  python3 build.py\n")
        fh.write("const GRAPH = ")
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write(";\n")
    return out_path


def ensure_notes(notes_dir, force_seed=False):
    """Seed the sample vault when there is nothing to build from."""
    has_notes = os.path.isdir(notes_dir) and any(iter_markdown(notes_dir))
    if has_notes and not force_seed:
        return False
    import seed_notes

    os.makedirs(notes_dir, exist_ok=True)
    count = seed_notes.seed(notes_dir)
    print("No notes found — wrote %d sample notes into %s" % (count, notes_dir))
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("notes", nargs="?", default=DEFAULT_NOTES,
                        help="folder of .md files (default: ./notes)")
    parser.add_argument("--out", default=DEFAULT_OUT, help="where to write graph-data.js")
    parser.add_argument("--seed", action="store_true", help="write the sample notes first")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    notes_dir = os.path.abspath(args.notes)
    ensure_notes(notes_dir, force_seed=args.seed)

    if not os.path.isdir(notes_dir):
        print("Notes folder does not exist: %s" % notes_dir, file=sys.stderr)
        return 2

    graph = build_graph(notes_dir)
    if not graph["nodes"]:
        print("No .md files found under %s" % notes_dir, file=sys.stderr)
        return 2

    write_graph_js(graph, os.path.abspath(args.out))

    if not args.quiet:
        print("Galaxy built: %d nodes, %d links across %d groups"
              % (len(graph["nodes"]), len(graph["links"]), len(graph["groups"])))
        print("  notes  : %s" % notes_dir)
        print("  output : %s" % os.path.abspath(args.out))
        print("\nNext:  python3 server.py   then open http://localhost:4700")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


# ---------------------------------------------------------------------------
# Live growth (used by the /remember endpoint)
# ---------------------------------------------------------------------------

def _aliases_for(label, rel_path):
    stem = os.path.splitext(os.path.basename(rel_path))[0].replace("-", " ")
    aliases = {normalise(label), normalise(stem), normalise(label_from_filename(rel_path))}
    return {a for a in aliases if len(a) >= MIN_ALIAS_LEN}


def append_note(graph, notes_dir, note_path):
    """Add one new note to an already-built graph, keeping every existing id stable.

    Returns (node, anchor_id) where anchor_id is the most closely related existing
    node — the position the new star is born at.
    """
    note = read_note(note_path, os.path.abspath(notes_dir))
    new_id = len(graph["nodes"])
    note["id"] = new_id

    body = note["_body"]
    scores = {}
    for existing in graph["nodes"]:
        weight = 0
        for alias in _aliases_for(existing["label"], existing["path"]):
            if re.search(r"\b" + re.escape(alias) + r"\b", body):
                weight += 2
            if alias in note["wikilinks"]:
                weight += 2
        # …and the other direction: does the existing note name this one?
        for alias in note["_aliases"]:
            if re.search(r"\b" + re.escape(alias) + r"\b", graph["_texts"][existing["id"]].lower()):
                weight += 2
        if weight:
            scores[existing["id"]] = weight

    for other_id, weight in scores.items():
        graph["links"].append({"source": new_id, "target": other_id, "value": weight})

    anchor_id = max(scores, key=scores.get) if scores else None

    clean = {
        "id": new_id,
        "label": note["label"],
        "group": note["group"],
        "path": note["path"],
        "excerpt": note["excerpt"],
        "words": note["words"],
        "degree": len(scores),
    }
    graph["nodes"].append(clean)
    graph["_texts"].append(note["_full"])
    if note["group"] not in graph["groups"]:
        graph["groups"].append(note["group"])
        graph["groups"].sort()

    return clean, anchor_id
