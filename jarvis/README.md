# JARVIS — a talking AI second brain

A 3D knowledge galaxy built from your own markdown notes, with a voice, a memory,
and a British butler in front of it.

Ask it a question out loud and it answers from your notes, flies the camera to the
note it used, and tells you where the answer came from. Say *"remember that…"* and a
new star is born in the galaxy and written to disk as a real markdown file.

Built from the six-prompt "Build Your Own JARVIS" pack — implemented, wired together,
and tested.

```
  Prompt 1  The Galaxy       build.py + viewer/index.html
  Prompt 2  The Brain        server.py  POST /chat
  Prompt 3  The Voice        Web Speech API, both directions
  Prompt 4  The Magic        fly-to-source from /chat's node list
  Prompt 5  The Personality  the butler system prompt + boot greeting
  Prompt 6  Total Recall     POST /remember, live node birth
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

## What to try

- **"What is our wholesale gross margin?"** — watch the camera dive to Unit Economics.
- **"Why are we not opening a second cafe?"** — six notes light up as a cluster.
- **"Good evening."** — small talk, and the galaxy deliberately stays put.
- **"Remember that prompt packs make excellent free gifts."** — a new star, written to
  `notes/captures/` as real markdown, born beside its closest relative.
- Click the 🎙 button and say any of the above.

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
python3 tests/test_jarvis.py          # 53 tests, standard library only
```

Covers the graph builder, the link rules, retrieval ranking, the butler prompt,
session history, `/remember`, the HTTP surface, the Anthropic request shape, and the
API-key containment described above.

An optional end-to-end test drives the real page in real Chromium:

```bash
pip install playwright && playwright install chromium
python3 tests/browser_smoke.py --shot /tmp/jarvis.png
```

32 checks: the galaxy renders, the camera flies, the panel opens, the answer cites its
sources, small talk moves nothing, a new star is born and written to disk, and the
console stays free of errors. It runs against a throwaway copy of the project, so your
notes are never touched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Mic button does nothing | Chrome → lock icon in the address bar → allow Microphone. Must be Chrome or Edge. |
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
