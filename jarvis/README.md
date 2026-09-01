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
  beyond    Time Machine     "what was I doing last Tuesday?"
  beyond    Web research     "research X" — searched, summarised, sources on a card
  beyond    Screen vision    👁  "Jarvis, what am I looking at?"
  beyond    Cloned voice     ElevenLabs — the reactor pulses to his real waveform
  beyond    Morning brief    "Good morning" — real Gmail + Calendar, inbox triage
  beyond    Agent hands      "Draft a reply to…" — composed, then a "do it" gate
  beyond    Computer control "Open Notepad", "play music", "lock the screen" (Windows/Mac/Linux)
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

## Talking to your computer (Windows, Mac, Linux)

Say **"open Notepad"**, **"play music"**, **"volume up"**, **"go to youtube.com"**, or
**"lock the screen"** and he does it on the machine the server runs on. Built for
Windows first (PowerShell / `cmd`), it also works on macOS (`open`, AppleScript) and
Linux (`xdg-open`).

Because this runs commands on your computer it is the most guarded feature here:

- **Off by default.** Set `"computer": {"enabled": true}` in `config.json` to turn it on.
- **A "do it" gate.** Each command is shown first and only runs when you say "do it" (or
  press the button); "no" stands it down. Prefer it instant? Set `"confirm": false`.
- **A fixed allowlist, never a shell.** A spoken phrase maps to a named action on a
  hard-coded list — open one of a known set of apps, open a validated http(s) URL, media
  transport, volume, or lock. Everything is built as an argv list and run with the shell
  disabled, so a phrase can't become an arbitrary command. App names resolve to fixed
  executables; a URL with a shell metacharacter or a non-http scheme is refused.

> **Windows execution is yours to verify.** I built and tested this on Linux, so the
> intent parsing, the allowlist, URL-injection rejection, the enable flag, and the
> two-step gate are all covered by tests — but the actual PowerShell/`cmd` calls I could
> only build and inspect, not run on Windows. Turn it on, try "open Notepad", and confirm
> it behaves before relying on it.

## Agent hands — drafting email, gated

Say **"draft a reply to Two Rivers"** or **"write an email to ops@hotel.com about the
order"** and he composes it — resolving the recipient from your inbox when you name a
person — then shows it as a card and waits. Nothing is created until you say **"do it"**
(or press the green button); **"no"** discards it. Even then he only ever **saves a
draft** to Gmail — he never sends. This is the one place JARVIS writes anything, so it
is deliberately a two-step, human-in-the-loop action.

It reuses the same Google connection as the brief, plus one extra scope
(`gmail.compose`) that you opt into during setup — read-only users are never asked for
write access. Re-run `setup_google.py` and answer yes to "Enable draft-writing?" to turn
it on; until then he'll say he can read your mail but not draft it.

The safety invariants are covered by tests: nothing is created before the gate, the
pending draft is per-session (your "do it" can't trigger someone else's draft), and a
failed save keeps the draft so a fixed retry still works.

## Morning brief (Gmail + Calendar)

Say **"good morning"** (or "brief me", "what needs me", "what's on today") and he reads
your real inbox and calendar back as a butler would over coffee — leading with what
actually needs you, an email that wants a reply before a meeting it relates to, the
promo quietly dropped. The structured inbox and calendar appear on a card beside the
spoken brief. Like research, it is about the world, so the galaxy stays put.

It is **read-only** — Gmail and Calendar readonly scopes; it sends nothing and changes
nothing — and, like the rest of JARVIS, **zero dependency**: OAuth2 and both Google
REST APIs are just HTTPS, so `google_api.py` speaks them over the standard library
rather than pulling in `google-api-python-client`.

**One-time setup** (five minutes, on your own machine):

```bash
python3 setup_google.py
```

That walks you through it: create a Google Cloud OAuth "Desktop app" client (Gmail API
+ Calendar API enabled), paste the client ID and secret, approve read-only access in
your browser, and it writes a **refresh token** into `config.json`. The consent happens
in your browser against your Google account; the token is written on your machine and
**never leaves the server** — the browser only ever receives the finished brief.

> **Setup happens on your computer, not here.** Google's consent flow opens a browser
> and redirects to `localhost` bound to your Google login, so it cannot run in this
> sandbox — which is exactly why `setup_google.py` is a script you run yourself. The
> integration is tested with Google's HTTP layer stubbed (token refresh, message and
> event parsing, the 403 that tells you to re-run setup); the brief composition and the
> card are proven live with stubbed inbox data feeding the real model.

The trigger is deliberately narrow: a greeting only briefs when it *is* the message
("good morning", "good morning, Jarvis"), never "good morning is a nice line for the
newsletter", and a notes question that merely contains "email" stays a notes question.

## A cloned voice (ElevenLabs)

Out of the box he speaks with the browser's built-in voice. Give him an ElevenLabs key
and he speaks with a real cloned or studio voice instead — and because the audio now
runs through the page's own WebAudio graph, the arc reactor pulses to his **actual
waveform** (a live `AnalyserNode`), not the per-word approximation the browser voice is
limited to. That is the PDF's "reactor HUD that pulses in rhythm with his voice", made
literal.

Set it in `config.json` (or the `ELEVENLABS_API_KEY` env var):

```json
{
  "api_key": "sk-ant-...",
  "elevenlabs": { "api_key": "sk-el-...", "voice_id": "", "model_id": "eleven_turbo_v2_5" }
}
```

Leave `voice_id` blank and he uses the first voice on your account; the ⚙ panel then
shows a **Voice** dropdown listing your real ElevenLabs voices (pick a British one for
the full butler), remembered per browser.

Same security posture as the Anthropic key: the ElevenLabs key is read only by the
server, the browser fetches audio from a `/speak` endpoint that proxies to ElevenLabs,
and the key never appears in any served response — there's a test that asserts it is
absent from the URL, the request body, and every response. If ElevenLabs is unset,
refused, or rate-limited, `/speak` returns a JSON error and the page falls back to the
browser voice rather than going silent. Offline mode never calls it at all.

> **Testing note:** I have no ElevenLabs key in my sandbox, so the *service* call is
> tested with a stubbed HTTP layer (request shape, key-as-header-only, error handling).
> The *browser* half is proven live: the audio path was driven with a real sine-wave
> WAV served in place of ElevenLabs, and the reactor core measurably swelled to peak
> amplitude 0.7 while it played — the pulse-to-voice link is real, not mocked. Building
> this also flushed out a genuine bug: `speak()` bumped its own cancellation token via
> `stopSpeaking()` *after* capturing it, so the cloned-voice path cancelled itself before
> the first note. Fixed, with the playback now covered by a browser test.

## Screen vision

Press 👁 (or ask *"Jarvis, what am I looking at?"*) and he takes one still frame of a
screen or window you pick, looks at it, and tells you what's there. Point it at an error
message, a chart, a form, a page in another language.

- **One frame, then it stops.** The browser's screen-share ends the instant the frame is
  grabbed — this is a glance, not an open window onto your desktop. The frame is scaled to
  the model's useful limit (1568px), sent once, and on the CLI path written to a temp file
  that is deleted in a `finally` block whether the look succeeds or fails. The activity log
  records *that* you looked, never *what* was on screen.
- **Same brain as everything else.** It uses the vision of the model you already
  configured — no new key, no new service. Offline mode says it has no eyes.
- **Chrome or Edge**, and only over `http://localhost` / `https` — `getDisplayMedia`
  needs a secure context.

> **A note on testing:** this is the one feature I could not exercise end-to-end in my
> own sandbox — headless Chromium has no display to capture (`getDisplayMedia` returns
> `NotReadableError`). So the *reading* half is proven live (JARVIS was handed a
> hand-built PNG and correctly described "a red square upper-left, a blue band, off-white
> background"), and the *capture* half is tested for everything except the OS-level grab:
> the trigger, the downscaling, the secure-context check, and — crucially — that a capture
> which fails to start reports it and leaves the UI idle rather than wedged.

## Web research

*"Jarvis, research the current price of green arabica"* — he searches the web, answers
in his own voice, and puts the sources on a card beside the reply. The galaxy does not
move: research is about the world, not about your vault.

It uses the search tool already available through the brain you configured — the
Messages API's `web_search` server tool, or the `claude` CLI's own WebSearch. **No new
dependency, no extra key, no third-party service.** Offline mode says so plainly rather
than guessing.

Two details worth knowing:

- **The tool version follows the model.** Dynamic filtering (`web_search_20260209`) only
  exists on Opus 5, Fable 5, Opus 4.8 and Sonnet 5; asking for it on Haiku 4.5 is a 400.
  Pick Haiku in the model dropdown and the request quietly falls back to the basic search
  tool, which every model accepts.
- **He never reads URLs aloud.** Every answer is spoken, and a spoken URL is noise. The
  sources are parsed out of the reply and rendered as chips; the spoken text keeps only
  the finding.

Triggering is deliberately strict — an explicit order at the *start* of the sentence
("research…", "look up…", "search the web for…", "what's the latest on…"). *"What do my
notes say about market research"* stays a notes question.

## Time Machine

*"What was I doing yesterday?"* — answered from a real, durable activity log, not
guessed from the notes. Every question asked and every thought captured is logged
with a timestamp; a Time Machine question reads that log back, in the butler's voice,
and flies the galaxy to the notes that day's activity actually touched.

It understands **today**, **yesterday**, **N days ago**, **last Tuesday** / **on
Tuesday** (the most recent past occurrence — asking "on Tuesday" on a Tuesday means
last week's, not today's), **this week**, **last week**, and explicit dates like
**August 25** or **25 August** (rolling back a year if that date hasn't happened yet
this year). An honest "nothing on record" beats a guess when the log is empty.

This is the one feature here with no viewer changes at all — it answers through the
same `/chat` contract as everything else, so the galaxy already knew how to react to
it.

```bash
# try it after asking a few questions and remembering something:
"What was I doing today?"
"What did I ask about last Tuesday?"
"What have I captured this week?"
```

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
- Ask a few real questions, then **"What was I doing today?"**
- **"Research the current price of green coffee"** — and watch the source chips appear.
- Press **👁** and point him at anything on your screen.
- Add an ElevenLabs key and watch the reactor pulse to his real voice.
- Connect Google and say **"good morning"** for a brief off your real inbox.
- Enable agent hands and say **"draft a reply to …"**, review, then **"do it"**.

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
python3 tests/test_jarvis.py          # 182 tests, standard library only
```

Covers the graph builder, the link rules, retrieval ranking (including follow-up
questions and the guard that stops an old topic being dragged into a new one), the
composed personality prompt, the model allowlist, Time Machine's date parsing (with
a fixed clock, so "last Tuesday" and "this week" have one correct answer) and its
trigger detection, the activity log and its trimming, web research (trigger anchoring,
per-model search tool version, citation extraction including the error-shaped result
that must not be read as a source, and `pause_turn` continuation), session history,
`/remember`, screen vision (frame validation of everything the browser sends —
foreign media types, rubbish base64, empty and oversized frames — and the API request
shape with the image leading), the ElevenLabs voice proxy (voice loading, the
key travelling as a header only and never in the URL, body, or any served response,
and graceful failure), the Google brief (OAuth token refresh and consent-URL shape,
Gmail and Calendar parsing, the brief trigger's greeting-vs-command split, and the
whole brief flow with Google and the model stubbed), the HTTP surface, the Anthropic request shape, and the
API-key containment described above.

An optional end-to-end test drives the real page in real Chromium:

```bash
pip install playwright && playwright install chromium
python3 tests/browser_smoke.py --shot /tmp/jarvis.png
```

68 checks: the galaxy renders, the camera flies, the panel opens, the answer cites its
sources, small talk moves nothing, a new star is born and written to disk, the reactor
changes state and kicks, the wake word parses commands (including mishearings and
non-matches), barge-in is safe when he is silent, the dials move and persist, a Time
Machine question summarises the day's real activity while an empty day is answered
honestly, research source chips render as safe external links, the screen-vision trigger is told
apart from notes questions and a failed capture leaves the UI idle rather than wedged,
the cloned-voice audio path plays and pulses the reactor to a real waveform, the
morning-brief card lists today's events and inbox without leaking email bodies, and the
console stays free of errors. It runs against a throwaway copy of
the project, so your notes are never touched.

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
| "I have no way to reach the outside world" | Research needs the API or the `claude` CLI; offline mode cannot search. |
| 👁 does nothing / "This browser will not let me see" | Screen capture needs Chrome or Edge over `localhost`/`https`. |
| "I have no eyes without a brain behind them" | Vision needs the API or the `claude` CLI; offline mode cannot see. |
| "I have no line to your inbox" | Run `python3 setup_google.py` to connect Gmail + Calendar. |
| "Google refused the request (403)" | The token was revoked or scopes changed — re-run `setup_google.py`. |
| "I can read your mail but not draft it" | Re-run `setup_google.py` and answer yes to "Enable draft-writing?". |
| "Open Notepad" does nothing | Computer control is off by default — set `"computer": {"enabled": true}` in `config.json`. |
| Still hear the browser voice with a key set | Check `config.json`'s `elevenlabs.api_key`, and pick a voice in the ⚙ panel. A refused key falls back silently to the browser voice. |
| Galaxy never appears | The library failed to load. `viewer/vendor/3d-force-graph.min.js` should exist; otherwise you need network access for the CDN fallback. |

## Layout

```
jarvis/
├── build.py              scans .md, writes viewer/graph-data.js
├── seed_notes.py         25 sample notes for a small coffee roastery
├── server.py             static server + /chat + /remember + /api/status
├── config.example.json   copied to config.json on first run (Anthropic + ElevenLabs + Google)
├── google_api.py         Gmail + Calendar over stdlib (no google client library)
├── setup_google.py       one-time OAuth sign-in for the morning brief
├── computer.py           voice control of the machine (allowlisted, argv-only)
├── activity.log          Time Machine's memory — gitignored, created on first use
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
