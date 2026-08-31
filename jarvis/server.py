#!/usr/bin/env python3
"""JARVIS — the server behind the knowledge galaxy.

Serves the viewer, retrieves from your notes, and puts a British butler in front of
an LLM. Standard library only.

    python3 server.py               # http://localhost:4700
    python3 server.py --port 8080
    python3 server.py --notes /path/to/vault

Security note: this process reads config.json from the project root and never serves
anything outside viewer/. Your API key cannot reach the browser.
"""

import argparse
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import build

HERE = os.path.dirname(os.path.abspath(__file__))
VIEWER_DIR = os.path.join(HERE, "viewer")
CONFIG_PATH = os.path.join(HERE, "config.json")

API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_MODEL = "claude-opus-5"
PLACEHOLDER_KEYS = {"", "PUT-YOUR-KEY-HERE", "sk-ant-xxx", "your-key-here"}

TOP_K = 6              # notes handed to the model
FLY_THRESHOLD = 3      # below this the question isn't really about the notes
CLUSTER_THRESHOLD = 4  # 4+ sources: light the cluster instead of diving to one
MAX_HISTORY = 8        # messages (4 exchanges) kept per session
MAX_SESSIONS = 200

STOPWORDS = set("""
a an and are as at be been but by can could did do does for from had has have he her him his
how i if in into is it its me my no not of on or our out she should so than that the their them
then there these they this those to too us was we were what when where which who whom why will
with would you your about any just like get got tell know
""".split())

SYSTEM_PROMPT = """You are JARVIS, the assistant to a knowledge galaxy built from the user's own markdown notes.

Character: a dry, impeccably polite British butler with a razor wit. You address the user as "sir" — occasionally, where it lands, not in every sentence. One genuinely funny line beats three bland ones. Never smug, never verbose.

Answering questions about the notes:
- Answer ONLY from the notes provided below. If they do not cover it, say so plainly and wittily — do not invent facts, figures or note titles.
- Give ONE witty sentence plus the facts that answer the question. Two or three sentences in total, maximum.
- Never recite or summarise a note back at length: the note is already on screen beside you. Cite the specific number or detail that answers the question, not the paragraph around it.
- Never mention "the notes provided", "the context" or "the excerpts". Speak as though you simply know the man's business.

Small talk, greetings and jokes:
- Answer in character, briefly. Do not drag the notes into it and do not pretend a greeting was a research question.

Never use markdown, bullet points or headings — every word you produce is spoken aloud as well as displayed."""


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def load_config(path=CONFIG_PATH):
    config = {"api_key": "PUT-YOUR-KEY-HERE", "model": DEFAULT_MODEL, "backend": "auto"}
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                config.update(json.load(fh))
        except (ValueError, OSError) as exc:
            print("! config.json could not be read (%s) — falling back to defaults" % exc,
                  file=sys.stderr)
    # An exported key is a convenience; config.json still wins if it holds a real one.
    if config.get("api_key") in PLACEHOLDER_KEYS and os.environ.get("ANTHROPIC_API_KEY"):
        config["api_key"] = os.environ["ANTHROPIC_API_KEY"]
    return config


def resolve_backend(config):
    """Decide how we answer: the API, the claude CLI, or offline extraction."""
    requested = (config.get("backend") or "auto").lower()
    has_key = config.get("api_key") not in PLACEHOLDER_KEYS and bool(config.get("api_key"))
    has_cli = shutil.which("claude") is not None

    if requested == "api":
        return "api" if has_key else "offline"
    if requested == "cli":
        return "cli" if has_cli else "offline"
    if requested == "offline":
        return "offline"
    if has_key:
        return "api"
    if has_cli:
        return "cli"
    return "offline"


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def tokenise(text):
    return [t for t in re.findall(r"[a-z0-9']+", text.lower()) if t not in STOPWORDS and len(t) > 1]


def term_weights(graph, terms):
    """How much is each query word worth?

    A word in half the notes ("cafe", "coffee") tells us far less about which note
    to open than a word in two of them ("roaster", "churn"). Without this, asking
    "why are we not opening a second cafe" opens the Cafe Opening Checklist purely
    because both title words are common.
    """
    cache = graph.setdefault("_df", {})
    total = len(graph["nodes"])
    weights = {}
    for term in set(terms):
        if term not in cache:
            pattern = re.compile(r"\b" + re.escape(term) + r"\b")
            cache[term] = sum(
                1 for i, node in enumerate(graph["nodes"])
                if pattern.search(graph["_texts"][i].lower()) or pattern.search(node["label"].lower())
            )
        # Standard IDF, floored so a common word still counts for something.
        weights[term] = max(0.35, math.log((total + 1.0) / (cache[term] + 1.0)) + 0.25)
    return weights


def score_notes(question, graph):
    """Score every note against the question. Title matches weigh extra.

    Returns [(node_id, score)] sorted best first, zero-scoring notes dropped.
    """
    terms = tokenise(question)
    if not terms:
        return []
    asked = question.lower()
    weights = term_weights(graph, terms)
    # Adjacent query words that stay close together in a note are strong evidence:
    # "second cafe" appears verbatim in the notes that actually answer the question,
    # while the Cafe Opening Checklist merely owns both words separately.
    pairs = []
    for a, b in zip(terms, terms[1:]):
        if a == b:
            continue
        near = r"\b%s\b\W+(?:\w+\W+){0,2}\b%s\b"
        pairs.append((
            re.compile("(?:" + near % (re.escape(a), re.escape(b))
                       + ")|(?:" + near % (re.escape(b), re.escape(a)) + ")"),
            min(weights[a], weights[b]),
        ))
    scored = []

    for node in graph["nodes"]:
        text = graph["_texts"][node["id"]].lower()
        label = node["label"].lower()
        score = 0.0

        # The whole title appearing in the question is the strongest signal there is.
        if len(label) >= 4 and label in asked:
            score += 12
        if node["group"].lower() in terms:
            score += 1.5

        for term in terms:
            weight = weights[term]
            if re.search(r"\b" + re.escape(term) + r"\b", label):
                score += 3.2 * weight   # a title word outweighs a body word…
            hits = len(re.findall(r"\b" + re.escape(term) + r"\b", text))
            if hits:
                score += min(hits, 4) * weight   # …but only in proportion to how rare it is

        for matcher, weight in pairs:
            if matcher.search(text):
                score += 5.0 * weight

        if score:
            scored.append((node["id"], score))

    scored.sort(key=lambda pair: (-pair[1], pair[0]))
    return scored


def build_context(graph, ranked):
    blocks = []
    for node_id, _score in ranked:
        node = graph["nodes"][node_id]
        blocks.append("## %s  (%s)\n%s" % (node["label"], node["group"], graph["_texts"][node_id]))
    return "\n\n".join(blocks)


# ---------------------------------------------------------------------------
# Backends
# ---------------------------------------------------------------------------

def call_anthropic(config, system, messages, timeout=60):
    """Anthropic Messages API over stdlib urllib.

    The project is stdlib-only by design (no pip installs), so this speaks raw HTTP
    rather than using the official SDK.
    """
    payload = {
        "model": config.get("model") or DEFAULT_MODEL,
        "max_tokens": 2048,
        "system": system,
        "messages": messages,
        # Short, well-mannered answers: adaptive thinking stays on, effort comes down.
        "output_config": {"effort": "low"},
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": config["api_key"],
            "anthropic-version": ANTHROPIC_VERSION,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        if exc.code == 401:
            raise BackendError("The API key in config.json was refused, sir. Do check it.")
        if exc.code == 429:
            raise BackendError("We are being rate limited, sir. A moment's patience.")
        raise BackendError("The API returned %s: %s" % (exc.code, detail))
    except urllib.error.URLError as exc:
        raise BackendError("I cannot reach the API, sir — %s" % exc.reason)

    if body.get("stop_reason") == "refusal":
        raise BackendError("I must decline that one, sir.")

    text = "".join(block.get("text", "") for block in body.get("content", [])
                   if block.get("type") == "text").strip()
    if not text:
        raise BackendError("The model returned nothing at all, sir. Most unlike it.")
    return text


def call_claude_cli(system, messages, timeout=180):
    """Run on a Claude Code subscription instead of an API key."""
    transcript = [system, ""]
    for message in messages:
        prefix = "User" if message["role"] == "user" else "You previously replied"
        transcript.append("%s: %s" % (prefix, message["content"]))
    transcript.append("\nReply now, in character, in two or three sentences.")
    try:
        result = subprocess.run(
            ["claude", "-p", "\n".join(transcript)],
            capture_output=True, text=True, timeout=timeout,
        )
    except FileNotFoundError:
        raise BackendError("The claude CLI is not on PATH, sir.")
    except subprocess.TimeoutExpired:
        raise BackendError("The claude CLI took too long, sir.")
    if result.returncode != 0:
        raise BackendError("claude CLI failed: %s" % (result.stderr or "").strip()[:300])
    text = result.stdout.strip()
    if not text:
        raise BackendError("The claude CLI returned nothing, sir.")
    return text


def answer_offline(question, graph, ranked):
    """No key, no CLI — still useful. Extractive answer straight from the notes.

    This is honest rather than clever: it quotes the note instead of pretending to
    reason about it, and the viewer labels it as offline mode.
    """
    if not ranked:
        return ("I have nothing on that in your notes, sir — and without an API key I "
                "am reduced to quoting rather than thinking.")
    terms = set(tokenise(question))
    node_id = ranked[0][0]
    text = graph["_texts"][node_id]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 30]
    best = sorted(
        sentences,
        key=lambda s: -sum(1 for term in terms if re.search(r"\b" + re.escape(term) + r"\b", s.lower())),
    )[:2]
    quote = " ".join(best) if best else text[:240]
    return "From %s, sir: %s" % (graph["nodes"][node_id]["label"], quote)


class BackendError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# The assistant
# ---------------------------------------------------------------------------

class Jarvis(object):
    def __init__(self, notes_dir, config, graph_js=None):
        self.notes_dir = os.path.abspath(notes_dir)
        self.config = config
        self.graph_js = graph_js or os.path.join(VIEWER_DIR, "graph-data.js")
        self.backend = resolve_backend(config)
        self.lock = threading.Lock()
        self.sessions = {}
        self.graph = build.build_graph(self.notes_dir)

    # -- state ------------------------------------------------------------
    @property
    def note_count(self):
        return len(self.graph["nodes"])

    def greeting(self, now=None):
        now = now or datetime.now()
        hour = now.hour
        part = "morning" if hour < 12 else ("afternoon" if hour < 18 else "evening")
        return ("Good %s, sir. %d notes indexed, all present and accounted for."
                % (part, self.note_count))

    def suggestions(self, count=3):
        """Three questions worth asking, derived from the notes actually present."""
        ranked = sorted(self.graph["nodes"], key=lambda n: (-n["degree"], n["label"]))
        picked, seen_groups = [], set()
        for node in ranked:                       # one per group first, for variety
            if node["group"] in seen_groups:
                continue
            seen_groups.add(node["group"])
            picked.append(node)
            if len(picked) == count:
                break
        for node in ranked:
            if len(picked) == count:
                break
            if node not in picked:
                picked.append(node)
        return ["What do my notes say about %s?" % node["label"] for node in picked]

    def history(self, session_id):
        return self.sessions.setdefault(session_id, [])

    def remember_turn(self, session_id, question, answer):
        history = self.history(session_id)
        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": answer})
        del history[:-MAX_HISTORY]
        if len(self.sessions) > MAX_SESSIONS:
            self.sessions.pop(next(iter(self.sessions)), None)

    # -- chat -------------------------------------------------------------
    def ask(self, question, session_id="default"):
        question = (question or "").strip()
        if not question:
            return {"answer": "You said nothing at all, sir.", "nodes": [], "sources": [],
                    "backend": self.backend, "mode": "idle"}

        with self.lock:
            ranked = score_notes(question, self.graph)[:TOP_K]
            relevant = [pair for pair in ranked if pair[1] >= FLY_THRESHOLD]
            context = build_context(self.graph, ranked) if ranked else "(no matching notes)"
            history = list(self.history(session_id))
            graph_nodes = self.graph["nodes"]

        prompt = ("Notes retrieved for this question:\n\n%s\n\n---\nThe user asks: %s"
                  % (context, question))
        messages = history + [{"role": "user", "content": prompt}]

        try:
            if self.backend == "api":
                answer = call_anthropic(self.config, SYSTEM_PROMPT, messages)
            elif self.backend == "cli":
                answer = call_claude_cli(SYSTEM_PROMPT, messages)
            else:
                answer = answer_offline(question, self.graph, ranked)
        except BackendError as exc:
            return {"answer": str(exc), "nodes": [], "sources": [],
                    "backend": self.backend, "mode": "error", "error": True}

        answer = tidy(answer)

        # Only fly the camera when the question was actually about the notes.
        node_ids = [node_id for node_id, _ in relevant]
        mode = "idle"
        if node_ids:
            mode = "cluster" if len(node_ids) >= CLUSTER_THRESHOLD else "focus"

        with self.lock:
            self.remember_turn(session_id, question, answer)

        return {
            "answer": answer,
            "nodes": node_ids,
            "sources": [graph_nodes[i]["label"] for i in node_ids],
            "backend": self.backend,
            "mode": mode,
        }

    # -- total recall -----------------------------------------------------
    def remember(self, text):
        text = (text or "").strip()
        text = re.sub(r"^(?:please\s+)?remember(?:\s+(?:that|this|to))?\b[\s,:.\u2014-]*",
                      "", text, flags=re.I).strip()
        if not text:
            return {"error": "Remember what, sir?"}

        title = title_from(text)
        captures = os.path.join(self.notes_dir, "captures")
        os.makedirs(captures, exist_ok=True)
        path = unique_path(captures, slugify(title))

        stamp = datetime.now().replace(microsecond=0)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("# %s\n\nCaptured %s by voice.\n\n%s\n"
                     % (title, stamp.strftime("%d %B %Y at %H:%M"), text))

        with self.lock:
            node, anchor = build.append_note(self.graph, self.notes_dir, path)
            self.graph.pop("_df", None)   # a new note changes every term's rarity
            build.write_graph_js(self.graph, self.graph_js)
            total = len(self.graph["nodes"])
            links = [l for l in self.graph["links"] if node["id"] in (l["source"], l["target"])]

        return {
            "node": node,
            "anchor": anchor,
            "links": links,
            "total": total,
            "path": os.path.relpath(path, self.notes_dir).replace(os.sep, "/"),
            "answer": witty_capture_line(title),
        }


def tidy(answer):
    """Strip markdown the model shouldn't have used — it all gets spoken aloud."""
    answer = re.sub(r"^\s*[-*•]\s+", "", answer, flags=re.MULTILINE)
    answer = re.sub(r"^\s*#{1,6}\s*", "", answer, flags=re.MULTILINE)
    answer = re.sub(r"\*\*(.+?)\*\*", r"\1", answer)
    answer = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", answer)
    answer = re.sub(r"`([^`]+)`", r"\1", answer)
    return re.sub(r"\n{2,}", "\n", answer).strip()


# Words a title should never end on — "…excellent free gifts for" reads like a truncation
# because it is one.
TRAILING_JUNK = set("""
a an and as at be but by for from in into is it of on or the to with that this than then
""".split())


def title_from(text, max_words=8):
    words = re.findall(r"[A-Za-z0-9'&-]+", text)[:max_words]
    while words and words[0].lower() in TRAILING_JUNK:
        words.pop(0)          # "remember to call X" -> "Call X"
    while words and words[-1].lower() in TRAILING_JUNK:
        words.pop()
    if not words:
        return "Untitled capture"
    title = " ".join(words)
    return title[0].upper() + title[1:]


def slugify(title):
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:60] or "capture"


def unique_path(folder, slug):
    candidate = os.path.join(folder, slug + ".md")
    counter = 2
    while os.path.exists(candidate):
        candidate = os.path.join(folder, "%s-%d.md" % (slug, counter))
        counter += 1
    return candidate


_CAPTURE_LINES = [
    "Noted, sir. “{title}” is now a star, filed where you will actually find it.",
    "Committed to memory, sir: “{title}” — which is more than can be said for most of your ideas.",
    "Filed under “{title}”, sir. The galaxy is one thought heavier.",
    "Duly recorded, sir. “{title}” is now officially somebody else's problem to forget.",
    "“{title}”, sir. Written down, so neither of us has to carry it.",
]


def witty_capture_line(title):
    return random.choice(_CAPTURE_LINES).format(title=title)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class JarvisHandler(BaseHTTPRequestHandler):
    server_version = "JARVIS/1.0"
    protocol_version = "HTTP/1.1"
    jarvis = None  # set on the server instance

    # -- helpers ----------------------------------------------------------
    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, message):
        self.send_json({"error": message}, status=status)

    def read_json(self, limit=64 * 1024):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length <= 0 or length > limit:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def resolve_static(self, path):
        """Map a URL path to a file inside viewer/, or None. Nothing else is servable."""
        path = path.split("?", 1)[0].split("#", 1)[0]
        path = urllib.request.url2pathname(path)
        if path in ("", "/"):
            path = "/index.html"
        candidate = os.path.normpath(os.path.join(VIEWER_DIR, path.lstrip("/\\")))
        root = os.path.realpath(VIEWER_DIR)
        real = os.path.realpath(candidate)
        if real != root and not real.startswith(root + os.sep):
            return None  # traversal attempt: ../config.json and friends
        if not os.path.isfile(real):
            return None
        return real

    # -- routes -----------------------------------------------------------
    def do_GET(self):
        route = self.path.split("?", 1)[0]

        if route == "/api/status":
            j = self.jarvis
            return self.send_json({
                "notes": j.note_count,
                "backend": j.backend,
                "model": j.config.get("model") if j.backend == "api" else None,
                "greeting": j.greeting(),
                "groups": j.graph["groups"],
                "suggestions": j.suggestions(),
            })

        target = self.resolve_static(route)
        if not target:
            return self.send_error_json(404, "Not found")

        with open(target, "rb") as fh:
            body = fh.read()
        extension = os.path.splitext(target)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(extension, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        # Always fresh: the graph changes underneath the page while it is open.
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        route = self.path.split("?", 1)[0]
        payload = self.read_json()
        if payload is None:
            return self.send_error_json(400, "Expected a JSON body")

        if route == "/chat":
            return self.send_json(self.jarvis.ask(
                payload.get("question", ""), payload.get("session") or "default"))

        if route == "/remember":
            result = self.jarvis.remember(payload.get("text", ""))
            status = 400 if result.get("error") else 200
            return self.send_json(result, status=status)

        return self.send_error_json(404, "Not found")

    def log_message(self, fmt, *args):
        if os.environ.get("JARVIS_QUIET"):
            return
        sys.stderr.write("  %s  %s\n" % (self.log_date_time_string(), fmt % args))


def make_server(jarvis, port=4700, host="127.0.0.1"):
    handler = type("BoundJarvisHandler", (JarvisHandler,), {"jarvis": jarvis})
    return ThreadingHTTPServer((host, port), handler)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=4700)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--notes", default=None, help="notes folder (default: from build)")
    parser.add_argument("--backend", choices=["auto", "api", "cli", "offline"], default=None,
                        help="override the brain: anthropic api, claude cli, or offline")
    args = parser.parse_args(argv)

    # Give the user a real file to paste their key into, rather than asking for it.
    if not os.path.exists(CONFIG_PATH):
        example = os.path.join(HERE, "config.example.json")
        if os.path.exists(example):
            shutil.copyfile(example, CONFIG_PATH)
            print("  Created config.json — paste your API key into it when you want the real brain.")

    config = load_config()
    if args.backend:
        config["backend"] = args.backend
    notes_dir = args.notes or config.get("notes_dir") or build.DEFAULT_NOTES
    build.ensure_notes(os.path.abspath(notes_dir))

    jarvis = Jarvis(notes_dir, config)
    build.write_graph_js(jarvis.graph, jarvis.graph_js)

    backend_note = {
        "api": "Anthropic API (%s)" % config.get("model", DEFAULT_MODEL),
        "cli": "claude CLI (your Claude Code subscription)",
        "offline": "OFFLINE — extractive answers only. Put a key in config.json for the real thing.",
    }[jarvis.backend]

    server = make_server(jarvis, port=args.port, host=args.host)
    print("\n  JARVIS online.")
    print("  %d notes indexed from %s" % (jarvis.note_count, jarvis.notes_dir))
    print("  Brain: %s" % backend_note)
    print("\n  Open  http://localhost:%d  in Google Chrome.\n" % args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Very good, sir. Shutting down.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
