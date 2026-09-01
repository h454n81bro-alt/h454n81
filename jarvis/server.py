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
import base64
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta
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
CONTEXT_WEIGHT = 0.45  # how much the previous question counts when resolving "that"
WEB_SEARCH_MAX_USES = 5
VISION_MAX_BYTES = 6 * 1024 * 1024        # the browser downscales before sending
VISION_MEDIA_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")

# Dynamic filtering exists on these; anything else (Haiku 4.5, older) gets the
# basic search tool, which every model accepts.
DYNAMIC_SEARCH_MODELS = {
    "claude-opus-5", "claude-fable-5", "claude-opus-4-8", "claude-opus-4-7",
    "claude-opus-4-6", "claude-sonnet-5", "claude-sonnet-4-6",
}

# Research is an explicit order, so the trigger is anchored to the start of the
# question. "What do my notes say about market research" must stay a notes
# question — the word appearing somewhere in the middle is not an instruction.
_RESEARCH_TRIGGER = re.compile(
    r"^(?:jarvis[,\s]+)?(?:please\s+|can you\s+|could you\s+|go\s+|"
    r"i want you to\s+|i'd like you to\s+)*"
    r"(research|look up|look into|search (?:the )?(?:web|internet|online)(?:\s+for)?"
    r"|google|find out about|what(?:'?s| is| are) the latest (?:on|in)"
    r"|latest news on)\b", re.I)
CAPTURE_LINK_MIN = 4.0 # score a captured note needs to wire itself to an existing one
CLUSTER_THRESHOLD = 4  # 4+ sources: light the cluster instead of diving to one
MAX_HISTORY = 8        # messages (4 exchanges) kept per session
MAX_SESSIONS = 200

# Words that mean the question leans on the previous one: "how far off is *that*
# first target?" cannot be retrieved from its own words alone.
ANAPHORA = ("that", "this", "it", "its", "they", "them", "those", "these", "there",
            "he", "she", "his", "her", "their", "same", "instead", "one")

STOPWORDS = set("""
a an and are as at be been but by can could did do does for from had has have he her him his
how i if in into is it its me my no not of on or our out she should so than that the their them
then there these they this those to too us was we were what when where which who whom why will
with would you your about any just like get got tell know
""".split())

# Models you can hot-swap between at runtime. Anything not on this list is refused,
# so a request body can never point the server at an arbitrary endpoint.
MODELS = [
    {"id": "claude-opus-5", "label": "Opus 5", "note": "the default; best answers"},
    {"id": "claude-sonnet-5", "label": "Sonnet 5", "note": "faster, cheaper"},
    {"id": "claude-haiku-4-5", "label": "Haiku 4.5", "note": "fastest, for quick lookups"},
    {"id": "claude-opus-4-8", "label": "Opus 4.8", "note": "previous Opus"},
    {"id": "claude-fable-5", "label": "Fable 5", "note": "most capable, most expensive"},
]
MODEL_IDS = [m["id"] for m in MODELS]

# TARS-style dials, 0–100. The defaults are the butler as originally written.
DIALS = ("wit", "brevity", "formality")
# Brevity sits mid-band on purpose: at rest the dials must reproduce the
# original butler exactly — "two or three sentences", not one.
DEFAULT_DIALS = {"wit": 75, "brevity": 55, "formality": 70}

PROMPT_HEAD = """You are JARVIS, the assistant to a knowledge galaxy built from the user's own markdown notes."""

PROMPT_TAIL = """Answering questions about the notes:
- Answer ONLY from the notes provided below. If they do not cover it, say so plainly — do not invent facts, figures or note titles.
- Never recite or summarise a note back at length: the note is already on screen beside you. Cite the specific number or detail that answers the question, not the paragraph around it.
- Never mention "the notes provided", "the context" or "the excerpts". Speak as though you simply know the man's business.

Small talk, greetings and jokes:
- Answer in character, briefly. Do not drag the notes into it and do not pretend a greeting was a research question.

Never use markdown, bullet points or headings — every word you produce is spoken aloud as well as displayed."""


def _band(value, low, high):
    """Which third of the dial are we in?"""
    return 0 if value < low else (1 if value < high else 2)


def clamp_dials(raw):
    """Accept whatever the browser sent and return sane 0-100 integers."""
    dials = dict(DEFAULT_DIALS)
    if isinstance(raw, dict):
        for name in DIALS:
            try:
                dials[name] = max(0, min(100, int(raw[name])))
            except (KeyError, TypeError, ValueError):
                pass
    return dials


def compose_system_prompt(dials=None):
    """Build the character from the dials. Same prompt at the defaults as before."""
    dials = clamp_dials(dials)

    wit = ["Play it completely straight. No jokes, no flourishes — just the facts, politely.",
           "Allow yourself the occasional dry aside, but never at the cost of the answer.",
           "A razor wit. One genuinely funny line beats three bland ones. Never smug."][
        _band(dials["wit"], 34, 67)]

    brevity = ["Take up to five sentences when the subject earns them.",
               "Two or three sentences in total, maximum.",
               "One sentence. Two only if the facts genuinely will not fit in one."][
        _band(dials["brevity"], 34, 67)]

    formality = ["Speak plainly and warmly, like a trusted colleague. Do not call the user \"sir\".",
                 "Courteous and relaxed. Call the user \"sir\" now and then, where it lands.",
                 "An impeccably polite British butler. Address the user as \"sir\" — often, but not in every single sentence."][
        _band(dials["formality"], 34, 67)]

    return "%s\n\nCharacter: %s %s\n\nLength: %s\n\n%s" % (
        PROMPT_HEAD, formality, wit, brevity, PROMPT_TAIL)


RESEARCH_BRIEF = """The user has asked you to research something on the WEB. This is not a question about their notes — do not answer it from the notes, and do not pretend the notes cover it.

Search, then give them the finding in your own voice, in two or three sentences. Lead with the answer, not with how you found it. Do not list or recite the source URLs: they are already displayed on screen beside your reply. If the search turns up nothing solid, say so plainly rather than filling the gap with something plausible."""

# The API backend gets its sources from structured web_search_tool_result blocks.
# The CLI backend has no such channel, so it is asked for a trailer that is parsed
# off and never spoken.
CLI_SOURCE_TRAILER = """

When you have finished your reply, add one final line beginning with SOURCES: followed by the URLs you actually used, separated by spaces. That line is stripped out before your reply is read aloud — it exists only so the sources can be displayed on screen."""

VISION_BRIEF = """The user has shared a still frame of their screen and asked you about it. Answer from what is actually visible in the image — this is not a question about their notes.

Say what matters in two or three sentences: the thing they asked about first. Do not narrate the whole screen, do not list every window, and never guess at text you cannot actually read. If the image is too small or blurred to make out, say so plainly."""

SYSTEM_PROMPT = compose_system_prompt()


# ---------------------------------------------------------------------------
# Time Machine — "what was I doing last Tuesday?"
# ---------------------------------------------------------------------------
# Reconstructed from a durable activity log, not from the notes themselves —
# the notes are what the business knows; this is what the user actually did.

ACTIVITY_KEEP = 5000  # trim the log once it grows past twice this many lines

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTH_NAMES = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_MONTH_PATTERN = "|".join(sorted(MONTH_NAMES, key=len, reverse=True))
_DATE_MONTH_DAY = re.compile(r"\b(" + _MONTH_PATTERN + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b", re.I)
_DATE_DAY_MONTH = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(" + _MONTH_PATTERN + r")\.?\b", re.I)
_DAYS_AGO = re.compile(r"\b(\d+)\s+days?\s+ago\b", re.I)
_WEEKDAY = re.compile(r"\b(last\s+)?(" + "|".join(WEEKDAYS) + r")\b", re.I)

# Only a phrase about the USER'S OWN activity counts — "what happened to Q3
# margins" is a notes question, not a Time Machine one. "what happened" alone
# only qualifies when paired with an actual date (checked in is_time_machine_query).
_PERSONAL_TRIGGER = re.compile(
    r"\b(what (?:was|were) i (?:doing|working on|up to|asking about|thinking about)"
    r"|what did i (?:do|ask|say|talk about|work on|capture)"
    r"|remind me what i (?:was doing|did)"
    r"|catch me up on)\b", re.I)


def _day_bounds(day):
    start = datetime.combine(day, datetime.min.time())
    return start, start + timedelta(days=1)


def extract_time_range(question, now=None):
    """Find the day (or week) a Time Machine question is asking about.

    Returns {"start": dt, "end": dt, "label": str}, or None if the question
    names no date at all. The caller defaults to "today" in that case — once a
    Time Machine phrase has matched, "what was I doing?" alone means today.
    """
    now = now or datetime.now()
    lowered = question.lower()

    if re.search(r"\btoday\b", lowered):
        start, end = _day_bounds(now.date())
        return {"start": start, "end": end, "label": "today"}

    if re.search(r"\byesterday\b", lowered):
        start, end = _day_bounds(now.date() - timedelta(days=1))
        return {"start": start, "end": end, "label": "yesterday"}

    if re.search(r"\blast week\b", lowered):
        this_monday = now.date() - timedelta(days=now.weekday())
        start, _ = _day_bounds(this_monday - timedelta(days=7))
        end, _ = _day_bounds(this_monday)
        return {"start": start, "end": end, "label": "last week"}

    if re.search(r"\bthis week\b", lowered):
        this_monday = now.date() - timedelta(days=now.weekday())
        start, _ = _day_bounds(this_monday)
        return {"start": start, "end": now, "label": "this week"}

    match = _DAYS_AGO.search(lowered)
    if match:
        n = int(match.group(1))
        start, end = _day_bounds(now.date() - timedelta(days=n))
        return {"start": start, "end": end, "label": "%d day%s ago" % (n, "" if n == 1 else "s")}

    match = _WEEKDAY.search(lowered)
    if match:
        target = WEEKDAYS.index(match.group(2).lower())
        delta = (now.weekday() - target) % 7
        delta = delta or 7   # asking "on Tuesday" on a Tuesday means last Tuesday, not today
        start, end = _day_bounds(now.date() - timedelta(days=delta))
        return {"start": start, "end": end, "label": "last " + match.group(2).capitalize()}

    for pattern, order in ((_DATE_MONTH_DAY, "month_day"), (_DATE_DAY_MONTH, "day_month")):
        match = pattern.search(lowered)
        if not match:
            continue
        month_text, day_text = (match.group(1), match.group(2)) if order == "month_day" \
            else (match.group(2), match.group(1))
        try:
            candidate = datetime(now.year, MONTH_NAMES[month_text.lower()], int(day_text)).date()
        except ValueError:
            continue
        if candidate > now.date():
            candidate = candidate.replace(year=candidate.year - 1)
        start, end = _day_bounds(candidate)
        return {"start": start, "end": end, "label": candidate.strftime("%-d %B")}

    return None


def extract_research_topic(question):
    """The subject of an explicit research order, or None if this isn't one."""
    question = (question or "").strip()
    match = _RESEARCH_TRIGGER.match(question)
    if not match:
        return None
    topic = question[match.end():].strip(" ,:?.\u2014-")
    topic = re.sub(r"^(?:for|about|on|into|up)\s+", "", topic, flags=re.I).strip()
    return topic or None


def is_research_query(question):
    return extract_research_topic(question) is not None


def is_time_machine_query(question, now=None):
    """Is this the user asking what THEY did, rather than what the notes say?"""
    lowered = question.lower()
    if _PERSONAL_TRIGGER.search(lowered):
        return True
    return "what happened" in lowered and extract_time_range(question, now) is not None


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


def resolve_model(requested, config):
    """Pick the model for one request, refusing anything off the allowlist."""
    if requested and requested in MODEL_IDS:
        return requested
    return config.get("model") or DEFAULT_MODEL


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


def needs_context(question):
    """Is this a follow-up that cannot stand on its own words?

    Only an explicit anaphor counts. Treating every short question as a follow-up
    drags the previous topic along: "when do we roast" asked after "what is our
    pricing strategy" then retrieves Pricing Strategy, which is plainly wrong.
    """
    lowered = question.lower()
    return any(re.search(r"\b" + word + r"\b", lowered) for word in ANAPHORA)


def score_notes(question, graph, context=None):
    """Score every note against the question. Title matches weigh extra.

    `context` is the previous question in the conversation. Its words count for
    less than the current ones, but without them a follow-up like "how far off is
    that target?" retrieves nothing it should and the camera flies somewhere wrong.

    Returns [(node_id, score)] sorted best first, zero-scoring notes dropped.
    """
    terms = tokenise(question)
    carried = [t for t in tokenise(context or "") if t not in set(terms)]
    if not terms and not carried:
        return []
    asked = question.lower()
    weights = term_weights(graph, terms + carried)
    # Adjacent query words that stay close together in a note are strong evidence:
    # "second cafe" appears verbatim in the notes that actually answer the question,
    # while the Cafe Opening Checklist merely owns both words separately.
    pairs = []
    for sequence, share in ((terms, 1.0), (tokenise(context or ""), CONTEXT_WEIGHT)):
        for a, b in zip(sequence, sequence[1:]):
            if a == b or a not in weights or b not in weights:
                continue
            near = r"\b%s\b\W+(?:\w+\W+){0,2}\b%s\b"
            pairs.append((
                re.compile("(?:" + near % (re.escape(a), re.escape(b))
                           + ")|(?:" + near % (re.escape(b), re.escape(a)) + ")"),
                min(weights[a], weights[b]) * share,
            ))

    scoring_terms = [(t, 1.0) for t in terms] + [(t, CONTEXT_WEIGHT) for t in carried]
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

        for term, share in scoring_terms:
            weight = weights[term] * share
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

def _anthropic_request(config, payload, timeout):
    """One raw Messages API round trip, with the errors phrased in character.

    The project is stdlib-only by design (no pip installs), so this speaks raw HTTP
    rather than using the official SDK.
    """
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
    return body


def call_anthropic(config, system, messages, timeout=60, model=None):
    body = _anthropic_request(config, {
        "model": model or config.get("model") or DEFAULT_MODEL,
        "max_tokens": 2048,
        "system": system,
        "messages": messages,
        # Short, well-mannered answers: adaptive thinking stays on, effort comes down.
        "output_config": {"effort": "low"},
    }, timeout)

    text = "".join(block.get("text", "") for block in body.get("content", [])
                   if block.get("type") == "text").strip()
    if not text:
        raise BackendError("The model returned nothing at all, sir. Most unlike it.")
    return text


def web_search_tool(model):
    """The search tool version this model actually accepts.

    Dynamic filtering only exists on the newer models; asking for it on, say,
    Haiku 4.5 is a 400. The basic tool works everywhere, so it is the fallback
    for anything not on the list.
    """
    kind = "web_search_20260209" if model in DYNAMIC_SEARCH_MODELS else "web_search_20250305"
    return {"type": kind, "name": "web_search", "max_uses": WEB_SEARCH_MAX_USES}


def extract_citations(blocks):
    """Pull (title, url) out of a response that used web search.

    Sources turn up in two places: the search tool's own result blocks, and the
    citations attached to the text Claude writes. Take both, keyed by URL.
    """
    found, seen = [], set()

    def add(title, url):
        if not url or url in seen:
            return
        seen.add(url)
        found.append({"title": (title or url)[:160], "url": url})

    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "web_search_tool_result":
            results = block.get("content")
            # A search error comes back as an object where a success is a list —
            # branch on that before indexing, or an error reads as one bad result.
            if isinstance(results, list):
                for item in results:
                    if isinstance(item, dict):
                        add(item.get("title"), item.get("url"))
        elif block.get("type") == "text":
            for citation in block.get("citations") or []:
                if isinstance(citation, dict):
                    add(citation.get("title") or citation.get("cited_text"), citation.get("url"))
    return found


def call_anthropic_research(config, system, messages, model, timeout=180, max_rounds=4):
    """Messages API with the web search server tool, following pause_turn."""
    conversation = list(messages)
    citations, text = [], ""

    for _ in range(max_rounds):
        body = _anthropic_request(config, {
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": conversation,
            "tools": [web_search_tool(model)],
            "output_config": {"effort": "medium"},
        }, timeout)

        blocks = body.get("content", [])
        citations.extend(extract_citations(blocks))
        found = "".join(b.get("text", "") for b in blocks
                        if isinstance(b, dict) and b.get("type") == "text").strip()
        if found:
            text = found

        # A long search can pause mid-turn; hand the work straight back to continue.
        if body.get("stop_reason") != "pause_turn":
            break
        conversation = conversation + [{"role": "assistant", "content": blocks}]

    if not text:
        raise BackendError("The search came back with nothing, sir.")

    seen, unique = set(), []
    for citation in citations:
        if citation["url"] not in seen:
            seen.add(citation["url"])
            unique.append(citation)
    return text, unique[:8]


_MD_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
_BARE_URL = re.compile(r"(?<![(\]])\bhttps?://[^\s<>\])]+")


def extract_links(text):
    """Sources out of CLI output, which writes markdown rather than citation blocks."""
    found, seen = [], set()
    for title, url in _MD_LINK.findall(text or ""):
        url = url.rstrip(".,;")
        if url not in seen:
            seen.add(url)
            found.append({"title": title.strip()[:160], "url": url})
    for url in _BARE_URL.findall(text or ""):
        url = url.rstrip(".,;")
        if url not in seen:
            seen.add(url)
            found.append({"title": url[:160], "url": url})
    return found[:8]


_SOURCES_LINE = re.compile(r"^[ \t]*SOURCES[ \t]*:[ \t]*(.*)$", re.I | re.M)


def split_sources(text):
    """Take the SOURCES: trailer off CLI output. It must never reach the speaker."""
    citations = []
    match = _SOURCES_LINE.search(text or "")
    if match:
        citations = extract_links(match.group(1))
        text = (text[:match.start()] + text[match.end():]).strip()
    if not citations:
        citations = extract_links(text)      # some replies just link inline instead
    return text, citations


def call_anthropic_vision(config, system, question, image_b64, media_type, model, timeout=120):
    body = _anthropic_request(config, {
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": [{"role": "user", "content": [
            # The image goes before the text: Claude reads the picture, then the ask.
            {"type": "image", "source": {"type": "base64",
                                         "media_type": media_type, "data": image_b64}},
            {"type": "text", "text": question},
        ]}],
        "output_config": {"effort": "low"},
    }, timeout)

    text = "".join(block.get("text", "") for block in body.get("content", [])
                   if isinstance(block, dict) and block.get("type") == "text").strip()
    if not text:
        raise BackendError("I could make nothing of that image, sir.")
    return text


def call_claude_cli_vision(system, question, image_path, timeout=180):
    """The CLI reads the frame off disk rather than taking it inline."""
    prompt = ("%s\n\nLook at the image file at %s, then answer.\n\nUser: %s"
              % (system, image_path, question))
    try:
        result = subprocess.run(
            ["claude", "-p", prompt, "--allowedTools", "Read"],
            capture_output=True, text=True, timeout=timeout,
        )
    except FileNotFoundError:
        raise BackendError("The claude CLI is not on PATH, sir.")
    except subprocess.TimeoutExpired:
        raise BackendError("Looking at that took too long, sir.")
    if result.returncode != 0:
        raise BackendError("claude CLI failed: %s" % (result.stderr or "").strip()[:300])
    text = result.stdout.strip()
    if not text:
        raise BackendError("I could make nothing of that image, sir.")
    return text


def decode_frame(image_b64, media_type):
    """Validate what the browser sent before it goes anywhere near the model."""
    if media_type not in VISION_MEDIA_TYPES:
        raise BackendError("That is not an image format I can read, sir.")
    try:
        raw = base64.b64decode(image_b64 or "", validate=True)
    except (ValueError, TypeError):
        raise BackendError("That image did not survive the journey, sir.")
    if not raw:
        raise BackendError("The screen came through empty, sir.")
    if len(raw) > VISION_MAX_BYTES:
        raise BackendError("That frame is too large to send, sir.")
    return raw


def call_claude_cli_research(system, question, timeout=300):
    """Research on a Claude Code subscription, using the CLI's own WebSearch tool."""
    prompt = "%s%s\n\nUser: %s\n\nSearch the web, then reply in character." % (
        system, CLI_SOURCE_TRAILER, question)
    try:
        result = subprocess.run(
            ["claude", "-p", prompt, "--allowedTools", "WebSearch"],
            capture_output=True, text=True, timeout=timeout,
        )
    except FileNotFoundError:
        raise BackendError("The claude CLI is not on PATH, sir.")
    except subprocess.TimeoutExpired:
        raise BackendError("The search took too long, sir. Do try a narrower question.")
    if result.returncode != 0:
        raise BackendError("claude CLI failed: %s" % (result.stderr or "").strip()[:300])
    text = result.stdout.strip()
    if not text:
        raise BackendError("The search came back with nothing, sir.")
    return split_sources(text)


def call_claude_cli(system, messages, timeout=180, model=None):
    """Run on a Claude Code subscription instead of an API key."""
    transcript = [system, ""]
    for message in messages:
        prefix = "User" if message["role"] == "user" else "You previously replied"
        transcript.append("%s: %s" % (prefix, message["content"]))
    transcript.append("\nReply now, in character, in two or three sentences.")
    command = ["claude", "-p", "\n".join(transcript)]
    if model:
        command[1:1] = ["--model", model]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
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
    def __init__(self, notes_dir, config, graph_js=None, activity_log=None):
        self.notes_dir = os.path.abspath(notes_dir)
        self.config = config
        self.graph_js = graph_js or os.path.join(VIEWER_DIR, "graph-data.js")
        self.activity_log = activity_log or os.path.join(HERE, "activity.log")
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

    # -- time machine's memory ---------------------------------------------
    def log_activity(self, kind, session_id, text, nodes=None, when=None):
        """Append one real event: a question asked, or a note captured.

        Durable (unlike self.sessions), so "what did I do yesterday" still
        works after the server has restarted.
        """
        entry = {
            "ts": (when or datetime.now()).isoformat(timespec="seconds"),
            "kind": kind, "session": session_id, "text": text, "nodes": nodes or [],
        }
        with self.lock:
            with open(self.activity_log, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry) + "\n")
            self._trim_activity_log()

    def _trim_activity_log(self):
        if not os.path.exists(self.activity_log):
            return
        with open(self.activity_log, encoding="utf-8") as fh:
            lines = fh.readlines()
        if len(lines) > ACTIVITY_KEEP * 2:
            with open(self.activity_log, "w", encoding="utf-8") as fh:
                fh.writelines(lines[-ACTIVITY_KEEP:])

    def read_activity(self):
        if not os.path.exists(self.activity_log):
            return []
        entries = []
        with open(self.activity_log, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    raw = json.loads(line)
                    raw["ts"] = datetime.fromisoformat(raw["ts"])
                except (ValueError, KeyError):
                    continue
                entries.append(raw)
        return entries

    # -- chat -------------------------------------------------------------
    def ask(self, question, session_id="default", dials=None, model=None):
        question = (question or "").strip()
        if not question:
            return {"answer": "You said nothing at all, sir.", "nodes": [], "sources": [],
                    "backend": self.backend, "mode": "idle"}

        topic = extract_research_topic(question)
        if topic:
            return self._research_answer(question, topic, session_id, dials, model)

        if is_time_machine_query(question):
            time_range = extract_time_range(question)
            if time_range is None:
                start, end = _day_bounds(datetime.now().date())
                time_range = {"start": start, "end": end, "label": "today"}
            return self._time_machine_answer(question, time_range, session_id, dials, model)

        return self._notes_answer(question, session_id, dials, model)

    def _notes_answer(self, question, session_id, dials, model):
        system = compose_system_prompt(dials)
        model = resolve_model(model, self.config)

        with self.lock:
            history = list(self.history(session_id))
            previous = next((m["content"] for m in reversed(history)
                             if m["role"] == "user"), None) if needs_context(question) else None
            ranked = score_notes(question, self.graph, context=previous)[:TOP_K]
            relevant = [pair for pair in ranked if pair[1] >= FLY_THRESHOLD]
            context = build_context(self.graph, ranked) if ranked else "(no matching notes)"
            graph_nodes = self.graph["nodes"]

        prompt = ("Notes retrieved for this question:\n\n%s\n\n---\nThe user asks: %s"
                  % (context, question))
        messages = history + [{"role": "user", "content": prompt}]

        try:
            if self.backend == "api":
                answer = call_anthropic(self.config, system, messages, model=model)
            elif self.backend == "cli":
                answer = call_claude_cli(system, messages, model=model)
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
        self.log_activity("chat", session_id, question, node_ids)

        return {
            "answer": answer,
            "nodes": node_ids,
            "sources": [graph_nodes[i]["label"] for i in node_ids],
            "backend": self.backend,
            "mode": mode,
            "model": model if self.backend != "offline" else None,
        }

    # -- screen vision ------------------------------------------------------
    def look(self, question, image_b64, media_type="image/jpeg",
             session_id="default", dials=None, model=None):
        question = (question or "").strip() or "What am I looking at?"

        if self.backend == "offline":
            return {"answer": ("I have no eyes without a brain behind them, sir — "
                               "vision needs the API or the CLI."),
                    "nodes": [], "sources": [], "backend": self.backend,
                    "mode": "idle", "model": None}

        try:
            raw = decode_frame(image_b64, media_type)
        except BackendError as exc:
            return {"answer": str(exc), "nodes": [], "sources": [],
                    "backend": self.backend, "mode": "error", "error": True}

        model = resolve_model(model, self.config)
        system = compose_system_prompt(dials) + "\n\n" + VISION_BRIEF

        temp_path = None
        try:
            if self.backend == "api":
                answer = call_anthropic_vision(
                    self.config, system, question, image_b64, media_type, model)
            else:
                suffix = "." + media_type.split("/")[-1].replace("jpeg", "jpg")
                handle, temp_path = tempfile.mkstemp(prefix="jarvis-frame-", suffix=suffix)
                with os.fdopen(handle, "wb") as fh:
                    fh.write(raw)
                answer = call_claude_cli_vision(system, question, temp_path)
        except BackendError as exc:
            return {"answer": str(exc), "nodes": [], "sources": [],
                    "backend": self.backend, "mode": "error", "error": True}
        finally:
            # The frame is the user's screen. It does not linger on disk.
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

        answer = tidy(answer)
        with self.lock:
            self.remember_turn(session_id, question, answer)
        # Log that a look happened; never what was on screen.
        self.log_activity("vision", session_id, question, [])

        return {
            "answer": answer, "nodes": [], "sources": [],
            "backend": self.backend, "mode": "vision",
            "model": model if self.backend != "offline" else None,
        }

    # -- research -----------------------------------------------------------
    def _research_answer(self, question, topic, session_id, dials, model):
        if self.backend == "offline":
            answer = ("I have no way to reach the outside world in this state, sir — "
                      "no API key and no CLI. The notes I can do; the internet I cannot.")
            return {"answer": answer, "nodes": [], "sources": [], "citations": [],
                    "backend": self.backend, "mode": "idle", "topic": topic, "model": None}

        model = resolve_model(model, self.config)
        system = compose_system_prompt(dials) + "\n\n" + RESEARCH_BRIEF
        with self.lock:
            history = list(self.history(session_id))

        try:
            if self.backend == "api":
                messages = history + [{"role": "user", "content": question}]
                answer, citations = call_anthropic_research(
                    self.config, system, messages, model)
            else:
                answer, citations = call_claude_cli_research(system, question)
        except BackendError as exc:
            return {"answer": str(exc), "nodes": [], "sources": [], "citations": [],
                    "backend": self.backend, "mode": "error", "error": True, "topic": topic}

        answer = tidy(answer)

        with self.lock:
            self.remember_turn(session_id, question, answer)
        self.log_activity("research", session_id, topic, [])

        # Research is about the world, not the vault — the galaxy stays put.
        return {
            "answer": answer, "nodes": [], "sources": [], "citations": citations,
            "backend": self.backend, "mode": "research", "topic": topic,
            "model": model if self.backend != "offline" else None,
        }

    # -- time machine -------------------------------------------------------
    def _time_machine_answer(self, question, time_range, session_id, dials, model):
        entries = [e for e in self.read_activity()
                  if time_range["start"] <= e["ts"] < time_range["end"]]
        chats = [e for e in entries if e["kind"] == "chat"]
        captures = [e for e in entries if e["kind"] == "remember"]
        research = [e for e in entries if e["kind"] == "research"]

        # Weight a captured note above a note merely mentioned in passing — it is
        # the stronger signal of what the day was actually about.
        touched = {}
        for e in chats:
            for node_id in e.get("nodes") or []:
                touched[node_id] = touched.get(node_id, 0) + 1
        for e in captures:
            for node_id in e.get("nodes") or []:
                touched[node_id] = touched.get(node_id, 0) + 2

        node_ids = [nid for nid, _ in sorted(touched.items(), key=lambda kv: -kv[1])
                   if 0 <= nid < len(self.graph["nodes"])][:8]
        labels = [self.graph["nodes"][nid]["label"] for nid in node_ids]

        if not chats and not captures and not research:
            answer = "Nothing on record for %s, sir. A quiet day, or an untracked one." % time_range["label"]
            with self.lock:
                self.remember_turn(session_id, question, answer)
            self.log_activity("chat", session_id, question, [])
            return {"answer": answer, "nodes": [], "sources": [], "backend": self.backend,
                    "mode": "idle", "model": None}

        sample_questions = [e["text"] for e in chats][:4]
        capture_titles = [e["text"] for e in captures][:4]
        research_topics = [e["text"] for e in research][:4]
        summary = "\n".join([
            "Activity log for %s:" % time_range["label"],
            "- %d question(s) asked%s" % (
                len(chats), (": " + "; ".join(sample_questions)) if sample_questions else ""),
            "- %d note(s) captured%s" % (
                len(captures), (": " + "; ".join(capture_titles)) if capture_titles else ""),
            "- %d topic(s) researched on the web%s" % (
                len(research), (": " + "; ".join(research_topics)) if research_topics else ""),
            "- notes touched: %s" % (", ".join(labels) if labels else "none"),
        ])

        system = compose_system_prompt(dials)
        model = resolve_model(model, self.config)
        with self.lock:
            history = list(self.history(session_id))
        prompt = ("This is a Time Machine question — the user wants to know what THEY were "
                  "doing, not what the notes themselves say. Here is the real activity log:\n\n"
                  "%s\n\n---\nThe user asks: %s" % (summary, question))
        messages = history + [{"role": "user", "content": prompt}]

        try:
            if self.backend == "api":
                answer = call_anthropic(self.config, system, messages, model=model)
            elif self.backend == "cli":
                answer = call_claude_cli(system, messages, model=model)
            else:
                answer = self._time_machine_offline(time_range, chats, captures, research, labels)
        except BackendError as exc:
            return {"answer": str(exc), "nodes": [], "sources": [], "backend": self.backend,
                    "mode": "error", "error": True}

        answer = tidy(answer)
        mode = "cluster" if len(node_ids) >= CLUSTER_THRESHOLD else ("focus" if node_ids else "idle")

        with self.lock:
            self.remember_turn(session_id, question, answer)
        self.log_activity("chat", session_id, question, node_ids)

        return {
            "answer": answer, "nodes": node_ids, "sources": labels,
            "backend": self.backend, "mode": mode,
            "model": model if self.backend != "offline" else None,
        }

    @staticmethod
    def _time_machine_offline(time_range, chats, captures, research, labels):
        bits = []
        if chats:
            bits.append("%d question%s asked" % (len(chats), "" if len(chats) == 1 else "s"))
        if captures:
            bits.append("%d note%s captured" % (len(captures), "" if len(captures) == 1 else "s"))
        if research:
            bits.append("%d topic%s researched" % (len(research), "" if len(research) == 1 else "s"))
        body = " and ".join(bits) if bits else "nothing notable"
        tail = (", mostly around %s" % ", ".join(labels[:3])) if labels else ""
        return "On %s, sir: %s%s." % (time_range["label"], body, tail)

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

            # Title matching alone almost never links a captured thought to anything —
            # "the second roaster quote is due from Dani" names no note. Fall back to
            # the same content scoring /chat uses, so the new star is born beside what
            # it is actually about.
            linked = {l["target"] for l in self.graph["links"] if l["source"] == node["id"]}
            linked |= {l["source"] for l in self.graph["links"] if l["target"] == node["id"]}
            related = [(nid, sc) for nid, sc in score_notes(text, self.graph)
                       if nid != node["id"] and sc >= CAPTURE_LINK_MIN][:3]
            for other_id, _score in related:
                if other_id not in linked:
                    self.graph["links"].append(
                        {"source": node["id"], "target": other_id, "value": 1})
                    linked.add(other_id)
            if anchor is None and related:
                anchor = related[0][0]
            node["degree"] = len(linked)

            build.write_graph_js(self.graph, self.graph_js)
            total = len(self.graph["nodes"])
            links = [l for l in self.graph["links"] if node["id"] in (l["source"], l["target"])]

        self.log_activity("remember", "voice", title, [node["id"]])

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
    answer = re.sub(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", r"\1", answer)
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
                "models": MODELS if j.backend != "offline" else [],
                "defaultModel": resolve_model(None, j.config) if j.backend != "offline" else None,
                "dials": DEFAULT_DIALS,
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
        # A screen frame is orders of magnitude larger than a question.
        limit = 12 * 1024 * 1024 if route == "/vision" else 64 * 1024
        payload = self.read_json(limit=limit)
        if payload is None:
            return self.send_error_json(400, "Expected a JSON body")

        if route == "/chat":
            return self.send_json(self.jarvis.ask(
                payload.get("question", ""),
                payload.get("session") or "default",
                dials=payload.get("dials"),
                model=payload.get("model")))

        if route == "/vision":
            return self.send_json(self.jarvis.look(
                payload.get("question", ""),
                payload.get("image", ""),
                payload.get("media_type") or "image/jpeg",
                payload.get("session") or "default",
                dials=payload.get("dials"),
                model=payload.get("model")))

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
