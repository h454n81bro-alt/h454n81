#!/usr/bin/env python3
"""Optional end-to-end browser test: drives the real viewer in real Chromium.

Unlike tests/test_jarvis.py this one is NOT standard library — it needs Playwright:

    pip install playwright && playwright install chromium
    python3 tests/browser_smoke.py [--headed] [--shot out.png]

It runs the server against a throwaway copy of the project, so your notes are
never touched.
"""

import argparse
import glob
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(url, timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return json.loads(response.read().decode())
        except Exception:
            time.sleep(0.3)
    raise RuntimeError("server never came up at " + url)


def wait_until(page, expression, timeout=25000):
    """True if the condition arrived; False on timeout — never raises."""
    try:
        page.wait_for_function(expression, timeout=timeout)
        return True
    except Exception:
        return False


class Check(object):
    def __init__(self):
        self.failures = []
        self.count = 0

    def that(self, label, condition, detail=""):
        self.count += 1
        if condition:
            print("  \033[32mPASS\033[0m  %s" % label)
        else:
            print("  \033[31mFAIL\033[0m  %s %s" % (label, detail))
            self.failures.append(label)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--shot", default=os.path.join(tempfile.gettempdir(), "jarvis.png"))
    args = parser.parse_args()

    from playwright.sync_api import sync_playwright

    # Some environments ship a Chromium that doesn't match the installed Playwright's
    # expected build. Honour an explicit path when one is provided.
    chrome = os.environ.get("CHROMIUM_PATH")
    if not chrome:
        for candidate in sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome"),
                                reverse=True):
            chrome = candidate
            break

    # Throwaway copy: /remember writes real files, and we don't want them in your vault.
    sandbox = tempfile.mkdtemp(prefix="jarvis-browser-")
    project = os.path.join(sandbox, "jarvis")
    shutil.copytree(ROOT, project, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    port = free_port()
    proc = subprocess.Popen(
        [sys.executable, "server.py", "--port", str(port), "--backend", "offline"],
        cwd=project, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env=dict(os.environ, JARVIS_QUIET="1"),
    )

    check = Check()
    try:
        status = wait_for("http://127.0.0.1:%d/api/status" % port)
        expected_notes = status["notes"]
        print("\nServer up on %d — %d notes, backend=%s\n" % (port, expected_notes, status["backend"]))

        with sync_playwright() as pw:
            launch = {
                "headless": not args.headed,
                "args": ["--use-gl=angle", "--use-angle=swiftshader",
                         "--enable-unsafe-swiftshader", "--no-sandbox"],
            }
            if chrome and os.path.exists(chrome):
                launch["executable_path"] = chrome
            browser = pw.chromium.launch(**launch)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto("http://127.0.0.1:%d/" % port, wait_until="networkidle")
            page.wait_for_function("window.JARVIS !== undefined", timeout=20000)
            page.wait_for_timeout(2500)   # let the force layout settle

            # -- Prompt 1: the galaxy renders ------------------------------
            check.that("page has no console errors", not errors, errors[:3])
            check.that("3d-force-graph loaded", page.evaluate("typeof ForceGraph3D") == "function")
            check.that("WebGL canvas is on the page",
                       page.evaluate("!!document.querySelector('#graph canvas')"))
            check.that("starfield canvas painted",
                       page.evaluate("document.getElementById('stars').width > 0"))
            rendered = page.evaluate("window.JARVIS.graph.graphData().nodes.length")
            check.that("all %d notes are in the galaxy" % expected_notes,
                       rendered == expected_notes, "got %s" % rendered)
            check.that("node ids equal their array index", page.evaluate(
                "window.JARVIS.graph.graphData().nodes.every((n,i)=> n.id===i)"))
            check.that("nodes have 3D positions (layout ran)", page.evaluate(
                "window.JARVIS.graph.graphData().nodes.every(n=> typeof n.z === 'number')"))
            check.that("HUD shows the real note count",
                       page.inner_text("#noteCount") == str(expected_notes))
            check.that("boot greeting is on screen and counts notes",
                       "notes indexed" in page.inner_text("#answer"))
            check.that("legend lists every group",
                       page.locator("#legend .row").count() == len(status["groups"]))
            check.that("three suggestion chips rendered",
                       page.locator("#suggestions button").count() == 3)

            # -- clicking a node flies and opens the panel -----------------
            before = page.evaluate("JSON.stringify(window.JARVIS.graph.cameraPosition())")
            page.evaluate("window.JARVIS.selectNode(window.JARVIS.byId.get(3), true)")
            page.wait_for_timeout(2600)
            check.that("side panel opened",
                       "open" in (page.get_attribute("#panel", "class") or ""))
            title = page.inner_text("#pTitle")
            check.that("panel shows the clicked note", title == page.evaluate(
                "window.JARVIS.byId.get(3).label"), title)
            check.that("panel shows an excerpt", len(page.inner_text("#pBody")) > 80)
            check.that("panel lists connected notes",
                       page.locator("#pLinks .chip").count() > 0)
            after = page.evaluate("JSON.stringify(window.JARVIS.graph.cameraPosition())")
            check.that("camera flew to the node", before != after)
            check.that("neighbours are highlighted", page.evaluate(
                "window.JARVIS.graph.graphData().links.some(l=>{"
                "const s=typeof l.source==='object'?l.source.id:l.source,"
                "t=typeof l.target==='object'?l.target.id:l.target; return s===3||t===3;})"))

            # -- Prompt 2 + 4: ask, answer, fly to source ------------------
            page.fill("#q", "what is our wholesale gross margin")
            page.press("#q", "Enter")
            page.wait_for_function(
                "document.getElementById('answer').innerText.indexOf('notes indexed') === -1",
                timeout=25000)
            page.wait_for_timeout(2600)
            answer = page.inner_text("#answer")
            check.that("an answer came back", len(answer) > 30, answer[:60])
            check.that("the answer cites its sources", "From " in answer)
            check.that("the galaxy proves it (nodes highlighted)",
                       page.evaluate("window.JARVIS.graph.nodeColor()("
                                     "window.JARVIS.byId.get(0)) !== undefined"))
            check.that("panel opened on the source note", len(page.inner_text("#pTitle")) > 0)

            # -- Prompt 5: small talk must not drag the camera -------------
            page.evaluate("window.__cam = JSON.stringify(window.JARVIS.graph.cameraPosition())")
            page.fill("#q", "good evening")
            page.press("#q", "Enter")
            page.wait_for_timeout(3200)
            check.that("small talk did not move the camera", page.evaluate(
                "JSON.stringify(window.JARVIS.graph.cameraPosition()) === window.__cam"))

            # -- Prompt 6: total recall ------------------------------------
            # A capture that relates to the vault must wire itself in…
            page.fill("#q", "remember that the subscription box needs a skip-a-month button")
            page.press("#q", "Enter")
            page.wait_for_function(
                "window.JARVIS.graph.graphData().nodes.length === %d" % (expected_notes + 1),
                timeout=25000)
            page.wait_for_timeout(2600)
            born = expected_notes
            check.that("a new star was born",
                       page.evaluate("window.JARVIS.graph.graphData().nodes.length")
                       == expected_notes + 1)
            check.that("HUD count went up",
                       page.inner_text("#noteCount") == str(expected_notes + 1))
            check.that("the new note is in the captures group", page.evaluate(
                "window.JARVIS.graph.graphData().nodes[%d].group" % born) == "captures")
            check.that("the new star is linked into the galaxy", page.evaluate(
                "window.JARVIS.graph.graphData().links.some(l=>{"
                "const s=typeof l.source==='object'?l.source.id:l.source,"
                "t=typeof l.target==='object'?l.target.id:l.target;"
                "return s===%d||t===%d;})" % (born, born)))
            check.that("the panel opened on the new star",
                       page.inner_text("#pTitle").lower().startswith("subscription box needs"))
            check.that("it was written to disk as markdown",
                       os.path.isdir(os.path.join(project, "notes", "captures"))
                       and any(f.endswith(".md") for f in
                               os.listdir(os.path.join(project, "notes", "captures"))))

            # …and a thought that relates to nothing must still be born, not crash.
            page.fill("#q", "remember that prompt packs make excellent free gifts")
            page.press("#q", "Enter")
            page.wait_for_function(
                "window.JARVIS.graph.graphData().nodes.length === %d" % (expected_notes + 2),
                timeout=25000)
            page.wait_for_timeout(2000)
            check.that("an unrelated capture is still born and flown to",
                       page.inner_text("#pTitle").lower().startswith("prompt packs"))

            # -- the reactor -----------------------------------------------
            check.that("reactor is on the page and idle",
                       page.evaluate("document.getElementById('reactor').className") == "idle")
            check.that("reactor exposes its state machine", page.evaluate(
                "typeof window.JARVIS.reactor.set === 'function' && "
                "typeof window.JARVIS.reactor.kick === 'function'"))
            page.evaluate("window.JARVIS.reactor.set('thinking')")
            check.that("reactor switches state cleanly", page.evaluate(
                "document.getElementById('reactor').className") == "thinking")
            page.evaluate("window.JARVIS.reactor.set('speaking'); window.JARVIS.reactor.kick()")
            check.that("a voice kick lands on the core", page.evaluate(
                "document.querySelector('#reactor .core').classList.contains('hit')"))
            page.evaluate("window.JARVIS.reactor.set('idle')")
            check.that("only one state class at a time", page.evaluate(
                "document.getElementById('reactor').classList.length") == 1)

            # -- wake word parsing (the mic itself is absent in headless) ----
            wake_cases = [
                ("jarvis what is the wholesale margin", "what is the wholesale margin"),
                ("Jarvis, remember that the roaster arrives", "remember that the roaster arrives"),
                ("hey Jarvis. when do we roast?", "when do we roast?"),
                ("jarvis", ""),                       # name alone -> await the order
                ("what is the wholesale margin", None),   # no wake word -> ignored
                ("", None),
                ("the jarvison protocol", None),      # must not match inside a word
            ]
            wake_ok = True
            for said, expected in wake_cases:
                got = page.evaluate("window.JARVIS.extractCommand(%s)" % json.dumps(said))
                if got != expected:
                    wake_ok = False
                    print("        wake: %r -> %r, expected %r" % (said, got, expected))
            check.that("wake word extracts the command (%d cases)" % len(wake_cases), wake_ok)
            check.that("common mishearings still wake him", page.evaluate(
                "window.JARVIS.extractCommand('jervis when do we roast')") == "when do we roast")

            # -- barge-in ---------------------------------------------------
            check.that("barge-in is wired to Escape and to stopSpeaking()", page.evaluate(
                "typeof window.JARVIS.stopSpeaking === 'function'"))
            check.that("stopSpeaking is safe when he is silent",
                       page.evaluate("window.JARVIS.stopSpeaking()") is False)
            page.keyboard.press("Escape")
            check.that("Escape does not throw or break the page",
                       page.evaluate("window.JARVIS.speaking()") is False)

            # -- morning brief card (rendered directly; no Google in this test) ---
            page.evaluate("""() => window.JARVIS.showAnswer(
              'Good morning, sir. Standup at 9:15, then the hotel call at two.',
              [], null,
              { events: [{when:'9:15 AM', summary:'Standup', location:'Roastery'},
                         {when:'2:00 PM', summary:'Two Rivers call', location:''}],
                emails: [{from:'Dani', subject:'Roaster quote', unread:true},
                         {from:'Newsletter', subject:'10% off', unread:false}] })""")
            check.that("the brief renders a card", page.locator("#answer .brief").count() == 1)
            check.that("today's events are listed",
                       page.locator("#answer .brief .col").nth(0).locator(".item").count() == 2)
            check.that("inbox items are listed",
                       page.locator("#answer .brief .col").nth(1).locator(".item").count() == 2)
            check.that("an unread email shows the dot, a read one does not", page.evaluate(
                "document.querySelectorAll('#answer .brief .item.read').length") == 1)
            check.that("no email body text leaks into the card",
                       "10% off" in page.inner_text("#answer")
                       and "unread" not in page.inner_text("#answer").lower())
            page.evaluate("() => window.JARVIS.showAnswer('plain', [], null, null)")
            check.that("an answer with no brief renders no card",
                       page.locator("#answer .brief").count() == 0)

            # -- voice (ElevenLabs when configured; here it is not) ----------
            check.that("reactor exposes a live-amplitude hook", page.evaluate(
                "typeof window.JARVIS.reactor.amp === 'function'"))
            page.evaluate("window.JARVIS.reactor.amp(0.8)")
            check.that("amplitude drives the reactor core scale", page.evaluate(
                "getComputedStyle(document.querySelector('#reactor .core'))"
                ".getPropertyValue('--amp').trim()") == "0.800")
            page.evaluate("window.JARVIS.reactor.amp(0)")
            check.that("this offline server offers no cloned voice",
                       page.evaluate("window.JARVIS.tts().available") is False)
            check.that("the voice picker stays hidden without ElevenLabs",
                       page.eval_on_selector("#voiceRow", "el => el.hidden") is True)
            check.that("speak() is safe to call with no audio unlocked", page.evaluate(
                "(function(){ window.JARVIS.speak('test'); return true; })()"))
            check.that("stopSpeaking is safe when nothing is playing",
                       page.evaluate("window.JARVIS.stopSpeaking()") is False)

            # Prove the cloned-voice audio path actually plays and drives the reactor
            # amplitude — without an ElevenLabs key, by turning on tts and serving a
            # real sine-wave WAV from a patched fetch. Headless Chromium plays audio
            # to a null sink but still decodes samples, so the analyser sees real
            # amplitude.
            played = page.evaluate("""async () => {
              const sr = 44100, secs = 1.2, n = sr * secs;
              const bytes = 44 + n * 2, buf = new ArrayBuffer(bytes), v = new DataView(buf);
              const w = (o, s) => { for (let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
              w(0,'RIFF'); v.setUint32(4, bytes-8, true); w(8,'WAVE'); w(12,'fmt ');
              v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
              v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true);
              v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
              for (let i=0;i<n;i++) v.setInt16(44+i*2, 18000*Math.sin(2*Math.PI*440*i/sr), true);
              const wavBlob = new Blob([buf], {type:'audio/wav'});

              const realFetch = window.fetch;
              window.fetch = (url, opts) => (typeof url==='string' && url.indexOf('/speak')>=0)
                ? Promise.resolve(new Response(wavBlob, {status:200,
                    headers:{'Content-Type':'audio/wav'}}))
                : realFetch(url, opts);
              window.JARVIS.tts().available = true;

              window.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
              await new Promise(r=>setTimeout(r,250));
              const core = document.querySelector('#reactor .core');
              let sawSpeaking=false, maxAmp=0;
              window.JARVIS.speak('a spoken sentence for the reactor to pulse to');
              for (let i=0;i<24;i++){
                await new Promise(r=>setTimeout(r,120));
                if (window.JARVIS.speaking()) sawSpeaking=true;
                maxAmp = Math.max(maxAmp, parseFloat(
                  getComputedStyle(core).getPropertyValue('--amp'))||0);
              }
              window.fetch = realFetch;
              window.JARVIS.tts().available = false;   // back to browser voice for the rest
              return {sawSpeaking, maxAmp};
            }""")
            check.that("cloned-voice audio plays and enters the speaking state",
                       played["sawSpeaking"] is True)
            check.that("the reactor pulses to real voice amplitude",
                       played["maxAmp"] > 0.1, "peak --amp %.3f" % played["maxAmp"])
            check.that("he returns to idle after speaking",
                       page.evaluate("window.JARVIS.reactor.state") != "speaking")

            # -- personality dials + model picker ---------------------------
            page.click("#gear")
            check.that("settings panel opens", page.is_visible("#settings"))
            check.that("three dials rendered", page.locator("#settings input[type=range]").count() == 3)
            check.that("dials default to the butler", page.evaluate(
                "JSON.stringify(window.JARVIS.dials())")
                == '{"wit":75,"brevity":55,"formality":70}')
            page.fill("#d-wit", "0")
            page.dispatch_event("#d-wit", "input")
            check.that("moving a dial updates state and its hint",
                       page.evaluate("window.JARVIS.dials().wit") == 0
                       and page.inner_text("#h-wit") == "straight-faced")
            check.that("dial value is persisted to localStorage", page.evaluate(
                "JSON.parse(localStorage.getItem('jarvis.prefs')).dials.wit") == 0)
            page.click("#resetDials")
            check.that("reset restores the butler",
                       page.evaluate("window.JARVIS.dials().wit") == 75)
            check.that("model picker reflects the backend", page.evaluate(
                "document.getElementById('modelPick').disabled") is True,
                "offline backend must not offer a model")
            page.click("#gear")
            check.that("settings panel closes", not page.is_visible("#settings"))

            # -- voice guards ----------------------------------------------
            check.that("speech synthesis is wired up",
                       page.evaluate("'speechSynthesis' in window"))
            check.that("mic button degrades gracefully without SpeechRecognition",
                       page.evaluate(
                           "(window.SpeechRecognition||window.webkitSpeechRecognition) "
                           "? !document.getElementById('mic').disabled "
                           ": document.getElementById('mic').disabled"))
            check.that("wake button degrades the same way", page.evaluate(
                "(window.SpeechRecognition||window.webkitSpeechRecognition) "
                "? !document.getElementById('wake').disabled "
                ": document.getElementById('wake').disabled"))

            # -- screen vision ----------------------------------------------
            # The grab itself needs a real display, which headless Chromium has not
            # got; everything around it is exercised, including the failure path.
            vision_cases = [
                ("what am I looking at?", True),
                ("Jarvis, what's on my screen", True),
                ("look at my screen", True),
                ("read my screen", True),
                ("what does this say", True),
                ("what is our pricing strategy", False),
                ("what was I doing yesterday", False),
                ("research the coffee market", False),
                ("remember that the roaster arrives", False),
            ]
            vision_ok = True
            for said, expected in vision_cases:
                got = page.evaluate("window.JARVIS.wantsScreen(%s)" % json.dumps(said))
                if got != expected:
                    vision_ok = False
                    print("        vision trigger: %r -> %r, expected %r" % (said, got, expected))
            check.that("screen requests are told apart from notes questions (%d cases)"
                       % len(vision_cases), vision_ok)

            check.that("a big screen is scaled down to the model's useful limit", page.evaluate(
                "JSON.stringify(window.JARVIS.scaledSize(3840, 2160, 1568))")
                == '{"width":1568,"height":882}')
            check.that("a small screen is never scaled up", page.evaluate(
                "JSON.stringify(window.JARVIS.scaledSize(800, 600, 1568))")
                == '{"width":800,"height":600}')
            check.that("capture is available in a secure context",
                       page.evaluate("window.JARVIS.canCapture()") is True)
            check.that("the eye button is wired", page.evaluate(
                "typeof document.getElementById('eye').onclick === 'function'"))

            # A capture that cannot start must not strand the UI. Stub getDisplayMedia
            # to reject the way a denied or headless capture does — calling the real
            # one shows a screen-picker that never resolves and wedges the test.
            page.evaluate("""() => {
              navigator.mediaDevices.getDisplayMedia = () =>
                Promise.reject(Object.assign(new Error('no source'),
                                             {name: 'NotReadableError'}));
              document.getElementById('answer').innerText = '';
              window.JARVIS.look('what am I looking at?');
            }""")
            check.that("a failed capture is reported, not swallowed",
                       wait_until(page, "/screen|saw nothing/i.test("
                                      "document.getElementById('answer').innerText)", 15000),
                       page.inner_text("#answer")[:80])
            check.that("a failed capture leaves the reactor idle, not stuck thinking",
                       page.evaluate("window.JARVIS.reactor.state") != "thinking")

            # -- research: source chips render and open externally -----------
            check.that("domain labels are derived from the URL", page.evaluate(
                "window.JARVIS.domainOf('https://www.barchart.com/futures/quotes/kc')")
                == "barchart.com")
            check.that("a malformed URL does not throw", page.evaluate(
                "window.JARVIS.domainOf('not a url')") is not None)
            page.evaluate("""window.JARVIS.showAnswer(
                'Roughly $3.11 a pound, sir.', [],
                [{title: 'ICE Coffee C', url: 'https://www.ice.com/coffee'},
                 {title: 'Barchart', url: 'https://barchart.com/kc'}])""")
            check.that("source chips are rendered for research",
                       page.locator("#answer .weblinks a").count() == 2)
            check.that("chips show the domain, not the raw URL",
                       page.locator("#answer .weblinks a").first.inner_text() == "ice.com")
            check.that("chips open in a new tab, safely", page.evaluate(
                "(function(a){return a.target==='_blank' && a.rel.indexOf('noopener')>=0;})"
                "(document.querySelector('#answer .weblinks a'))"))
            check.that("an answer with no citations renders no chip row", page.evaluate(
                "(function(){window.JARVIS.showAnswer('Plain answer, sir.', [], []);"
                "return document.querySelectorAll('#answer .weblinks a').length;})()") == 0)

            # -- Time Machine: what was I doing today? -----------------------
            page.fill("#q", "what was I doing today?")
            page.press("#q", "Enter")
            # Offline mode phrases this deterministically: "On today, sir: ..."
            arrived = wait_until(page, "/on today, sir/i.test("
                                     "document.getElementById('answer').innerText)", 30000)
            tm_answer = page.inner_text("#answer")
            check.that("time machine answered at all", arrived, tm_answer[:80])
            check.that("time machine summarises today's real activity",
                       "question" in tm_answer.lower() and "note" in tm_answer.lower(),
                       tm_answer[:120])
            check.that("time machine did not fall through to a notes answer",
                       "From " not in tm_answer or "sir" in tm_answer.lower())

            # A day with nothing logged must be answered honestly, not guessed at.
            page.fill("#q", "what did I do 3 days ago?")
            page.press("#q", "Enter")
            check.that("an empty day says so plainly",
                       wait_until(page, "/nothing on record/i.test("
                                      "document.getElementById('answer').innerText)", 30000),
                       page.inner_text("#answer")[:80])

            check.that("still no console errors after the whole flow",
                       not errors, errors[:3])

            page.evaluate("window.JARVIS.selectNode(window.JARVIS.byId.get(1), true)")
            page.wait_for_timeout(2800)
            page.screenshot(path=args.shot)
            print("\n  screenshot: %s" % args.shot)
            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(sandbox, ignore_errors=True)

    print("\n%d checks, %d failed" % (check.count, len(check.failures)))
    for failure in check.failures:
        print("  - " + failure)
    return 1 if check.failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
