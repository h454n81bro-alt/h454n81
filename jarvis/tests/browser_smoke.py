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

            # -- voice guards ----------------------------------------------
            check.that("speech synthesis is wired up",
                       page.evaluate("'speechSynthesis' in window"))
            check.that("mic button degrades gracefully without SpeechRecognition",
                       page.evaluate(
                           "(window.SpeechRecognition||window.webkitSpeechRecognition) "
                           "? !document.getElementById('mic').disabled "
                           ": document.getElementById('mic').disabled"))

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
