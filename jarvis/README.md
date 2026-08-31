# JARVIS — a talking AI second brain

A 3D knowledge galaxy built from your own markdown notes, with a voice, a memory,
and a British butler in front of it.

Ask it a question out loud and it answers from your notes, flies the camera to the
note it used, and tells you where the answer came from. Say *"remember that…"* and a
new star is born in the galaxy and written to disk as a real markdown file.

Built from the six-prompt "Build Your Own JARVIS" pack — implemented, wired together,
and tested — plus a second layer from the pack's own "where this stops, and JARVIS
begins" list: an arc reactor that pulses with his voice, a wake word, barge-in,
TARS-style personality dials, and model hot-swap.

```
  Prompt 1  The Galaxy       build.py + viewer/index.html
  Prompt 2  The Brain        server.py  POST /chat
  Prompt 3  The Voice        Web Speech API, both directions
  Prompt 4  The Magic        fly-to-source from /chat's node list
  Prompt 5  The Personality  the butler system prompt + boot greeting
  Prompt 6  Total Recall     POST /remember, live node birth

  beyond    Reactor HUD      pulses per spoken word
  beyond    Wake word        "Jarvis, when do we roast?" — always listening
  beyond    Barge-in         talk over him and he stops
  beyond    Personality      wit / brevity / formality dials
  beyond    Model hot-swap   Opus 5, Sonnet 5, Haiku 4.5, Opus 4.8, Fable 5
```

## Quick start

```bash
cd jarvis
python3 build.py        # writes viewer/graph-data.js (seeds 25 sample notes if you have none)
python3 server.py       # http://localhost:4700
```

Open **http://localhost:4700 in Google Chrome** — the microphone and the voice need
Chrome or Edge; Safari won't do it. Click once anywhere on the page to let it speak
(browsers block audio until you interact).

There are no dependencies. Python 3.8+ and a browser, nothing else — no pip installs,
no npm, no build step.

### Using your own notes

```bash
python3 build.py /path/to/your/obsidian/vault
python3 server.py --notes /path/to/your/obsidian/vault
```

Any folder of `.md` files works. Notes link to each other when one mentions another's
title or they share `[[wikilinks]]`, and the folder each note lives in becomes its
colour group.

## Giving it a real brain

Out of the box the server picks whichever brain it can find:

| Backend | When it's used | What you get |
|---|---|---|
| **Anthropic API** | `config.json` has a real key | The full butler. Best answers. |
| **claude CLI** | no key, but `claude` is on your PATH | The full butler on your Claude Code subscription. Slower, free. |
| **offline** | neither | Extractive quotes from the matching note. No wit, but it works. |

To use the API, put your key in `config.json` (created for you on first run):

```json
{ "api_key": "sk-ant-...", "model": "claude-opus-5", "backend": "auto" }
```

> **Never paste your API key into a chat window** — type it into `config.json`
> yourself. Anything pasted into a chat should be treated as exposed.
>
> `config.json` is gitignored, is read only by the server process, and lives outside
> `viewer/` — the only folder the server will serve. The key cannot reach the browser.
> There is a test that tries a dozen ways to fetch it and asserts every one fails.

Force a backend with `python3 server.py --backend offline|cli|api`.

## The reactor, the wake word, and the dials

**The reactor** (top left) is the state of him at a glance: breathing slowly when
idle, red and quick when listening, spinning while thinking, and kicking once per
spoken word while he talks. That last one rides `speechSynthesis`'s `onboundary`
events — the honest way to sync, because Chrome will not route synthesised speech
into WebAudio for real amplitude analysis.

**The wake word** is the ◉ button. Turn it on and he listens continuously; say
*"Jarvis, when do we roast?"* and the command after his name is what gets asked.
Say just *"Jarvis"* and he waits for the order. Chrome ends continuous recognition
on its own every minute or so, so it restarts itself — without that the wake word
quietly dies after the first timeout. It also answers to *jervis*, *jarvix* and
*travis*, because Chrome mishears the name about as often as it hears it.

**Barge-in**: press Escape, click the answer, hit the mic, ask something new, or say
his name — any of those stop him mid-sentence. While he is speaking the microphone
is also hearing him, so in wake mode only his name gets through; everything else is
assumed to be his own voice coming back.

**The dials** (⚙) rebuild the character on the server for every question:

| Dial | Low | High |
|---|---|---|
| Wit | straight-faced, no jokes | razor wit |
| Brevity | up to five sentences | one sentence |
| Formality | a plain-spoken colleague, no "sir" | full butler |

At their defaults they reproduce the original butler exactly. No setting can talk
him out of answering only from your notes, out of admitting when they do not cover
something, or into using markdown — those rules sit outside the dials, and a test
checks all three at every setting.

**Model hot-swap** is in the same panel. The server only accepts models on its own
allowlist, so a request body can never point it somewhere else; anything unknown
falls back to the configured default. Both the API and the `claude` CLI backend
honour the choice. Your dials and model are remembered in `localStorage`.

## What to try

- **"What is our wholesale gross margin?"** — watch the camera dive to Unit Economics.
- **"Why are we not opening a second cafe?"** — six notes light up as a cluster.
- **"Good evening."** — small talk, and the galaxy deliberately stays put.
- **"Remember that prompt packs make excellent free gifts."** — a new star, written to
  `notes/captures/` as real markdown, born beside its closest relative.
- Click the 🎙 button and say any of the above.
- Turn on ◉ and say **"Jarvis, when do we roast?"** without touching anything.
- Interrupt him mid-answer with **Escape**.
- Drag **Wit** to 0 and **Brevity** to 100, then ask the same question again.

## How it works

```
notes/*.md ──build.py──> viewer/graph-data.js   (labels, groups, 700-char excerpts, links)
                              │
                              └─> viewer/index.html   3d-force-graph + starfield + voice
                                        │  POST /chat  {question, session}
                                        ▼
server.py ── keyword retrieval (IDF-weighted, title-boosted, proximity-aware)
          ── top 6 notes ──> Anthropic Messages API ──> {answer, nodes[], mode}
                                                             │
                                        fly-to-source ◄──────┘
```

A few details that matter:

- **Node `id` == its index in the `nodes` array.** The viewer and `/chat` both look
  notes up by index, so `build.py` guarantees it and a test enforces it.
- **Only excerpts reach the browser.** Full note text stays server-side as retrieval
  material; `graph-data.js` never contains it.
- **`/chat` decides whether to move the camera.** If nothing scores above the
  relevance threshold the response carries an empty `nodes` list, so "tell me a joke"
  doesn't drag you across the galaxy. Four or more sources lights the whole cluster
  instead of diving to one.
- **Retrieval weights rare words over common ones.** Without that, "why are we not
  opening a second cafe" returns the *Cafe Opening Checklist* — both title words are
  common — instead of the cash-flow note that actually answers it.
- **`/remember` appends** rather than rebuilding, so existing node ids stay stable and
  the open page can grow without a reload.

## Testing

```bash
python3 tests/test_jarvis.py          # 73 tests, standard library only
```

Covers the graph builder, the link rules, retrieval ranking (including follow-up
questions and the guard that stops an old topic being dragged into a new one), the
composed personality prompt, the model allowlist, session history, `/remember`, the
HTTP surface, the Anthropic request shape, and the API-key containment described
above.

An optional end-to-end test drives the real page in real Chromium:

```bash
pip install playwright && playwright install chromium
python3 tests/browser_smoke.py --shot /tmp/jarvis.png
```

51 checks: the galaxy renders, the camera flies, the panel opens, the answer cites its
sources, small talk moves nothing, a new star is born and written to disk, the reactor
changes state and kicks, the wake word parses commands (including mishearings and
non-matches), barge-in is safe when he is silent, the dials move and persist, and the
console stays free of errors. It runs against a throwaway copy of the project, so your
notes are never touched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Mic button does nothing | Chrome → lock icon in the address bar → allow Microphone. Must be Chrome or Edge. |
| Wake word stops working after a minute | It restarts itself; if it does not, the mic permission was revoked. Toggle ◉ off and on. |
| He interrupts himself when the wake word is on | The mic is hearing the speakers. Use headphones, or turn ◉ off while he answers. |
| No sound | Click anywhere on the page once, then ask again. Browsers block audio before the first interaction. |
| Page looks stale after a change | Hard reload: `Cmd+Shift+R` / `Ctrl+Shift+R`. |
| Badge says "offline mode" | No API key in `config.json` and no `claude` on your PATH. Both are fine — answers are just extractive. |
| "The API key in config.json was refused" | The key is wrong, or the placeholder is still in the file. |
| Answers are generic | The notes path was wrong. Re-run `python3 build.py /full/absolute/path`. |
| Galaxy never appears | The library failed to load. `viewer/vendor/3d-force-graph.min.js` should exist; otherwise you need network access for the CDN fallback. |

## Layout

```
jarvis/
├── build.py              scans .md, writes viewer/graph-data.js
├── seed_notes.py         25 sample notes for a small coffee roastery
├── server.py             static server + /chat + /remember + /api/status
├── config.example.json   copied to config.json on first run
├── notes/                your markdown (sample vault by default)
├── viewer/
│   ├── index.html        the whole front end
│   ├── graph-data.js     generated
│   └── vendor/           3d-force-graph (MIT), checked in so it works offline
└── tests/
    ├── test_jarvis.py    53 stdlib tests
    └── browser_smoke.py  32 checks in real Chromium (optional)
```

Method and prompt sequence from the *Build Your Own JARVIS* free prompt pack by
Zubair Trabzada.
