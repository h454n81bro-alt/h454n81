#!/usr/bin/env python3
"""One-time Google sign-in for the morning brief — standard library only.

Run this on your own machine. It opens your browser, you approve read-only access
to Gmail and Calendar, and it writes a refresh token into config.json. Your token
never leaves your computer, and this script is the only thing that ever sees the
consent code.

    python3 setup_google.py

Before running, create an OAuth client (five minutes, once):
  1. https://console.cloud.google.com/  → create or pick a project
  2. APIs & Services → Enable APIs → enable "Gmail API" and "Google Calendar API"
  3. APIs & Services → Credentials → Create credentials → OAuth client ID
     → Application type: "Desktop app"
  4. Put the Client ID and Client secret into config.json under "google", or paste
     them when this script asks.
"""

import http.server
import json
import os
import sys
import threading
import urllib.parse
import webbrowser

import google_api

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
REDIRECT_HOST = "127.0.0.1"
REDIRECT_PORT = 4711                 # must match an authorised redirect URI (see note below)
REDIRECT_URI = "http://%s:%d/" % (REDIRECT_HOST, REDIRECT_PORT)


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def save_config(config):
    with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2)
        fh.write("\n")


def ask(prompt, current):
    if current and current not in google_api.PLACEHOLDERS:
        return current
    value = input(prompt).strip()
    return value


class CatchCode(http.server.BaseHTTPRequestHandler):
    """A throwaway server that catches Google's redirect and reads the code."""
    result = {}

    def do_GET(self):
        params = dict(urllib.parse.parse_qsl(self.path.split("?", 1)[-1]))
        CatchCode.result = params
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        ok = "code" in params and "error" not in params
        body = ("<h2>%s</h2><p>You can close this tab and return to the terminal.</p>"
                % ("All set — JARVIS can see your inbox now." if ok
                   else "Something went wrong: " + params.get("error", "no code returned")))
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *args):
        pass


def main():
    config = load_config()
    google = dict(config.get("google") or {})

    print("JARVIS — Google sign-in for the morning brief\n")
    print("This grants READ-ONLY access to Gmail and Calendar. It sends and changes nothing.\n")
    print("Note: in your OAuth client's settings, add this exact Authorised redirect URI:")
    print("    %s\n" % REDIRECT_URI)

    google["client_id"] = ask("Client ID: ", google.get("client_id"))
    google["client_secret"] = ask("Client secret: ", google.get("client_secret"))
    if not google["client_id"] or not google["client_secret"]:
        print("\nNo client credentials — cannot continue.", file=sys.stderr)
        return 2

    state = os.urandom(8).hex()
    url = google_api.consent_url(google["client_id"], REDIRECT_URI, state)

    server = http.server.HTTPServer((REDIRECT_HOST, REDIRECT_PORT), CatchCode)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()

    print("\nOpening your browser to approve access…")
    print("If it does not open, paste this into your browser:\n\n%s\n" % url)
    try:
        webbrowser.open(url)
    except Exception:
        pass

    thread.join(timeout=300)
    server.server_close()
    result = CatchCode.result

    if result.get("state") != state:
        print("\nState mismatch — aborting for safety.", file=sys.stderr)
        return 2
    if "code" not in result:
        print("\nNo authorisation code received: %s"
              % result.get("error", "timed out"), file=sys.stderr)
        return 2

    print("Exchanging the code for a token…")
    try:
        tokens = google_api.exchange_code(
            google["client_id"], google["client_secret"], result["code"], REDIRECT_URI)
    except google_api.GoogleError as exc:
        print("\n%s" % exc, file=sys.stderr)
        return 2

    google["refresh_token"] = tokens["refresh_token"]
    config["google"] = google
    save_config(config)

    print("\nDone. A refresh token is saved in config.json.")
    print("Start the server and say “good morning”.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
