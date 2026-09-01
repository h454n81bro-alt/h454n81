#!/usr/bin/env python3
"""JARVIS — run the whole thing with one command.

    python3 jarvis.py

Builds the knowledge galaxy from your notes, starts the local server, and opens
the viewer in Chrome (or Edge). Nothing to install — Python 3 and a browser.

Options:
    python3 jarvis.py --no-open              don't open a browser
    python3 jarvis.py --notes /path/to/vault use your own markdown vault
    python3 jarvis.py --port 8080            serve on another port
    python3 jarvis.py --backend offline      force a brain (api / cli / offline)
    python3 jarvis.py setup                  connect Gmail + Calendar (morning brief)

The first run writes config.json for you. Put your Anthropic API key in it for the
best answers — or install the `claude` CLI and it uses that — or run with nothing
and it still works with extractive answers.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

BANNER = r"""
      _   _   ___     _____ ___
   _ | | /_\ | _ \ \ / /_ _/ __|     a talking AI second brain
  | || |/ _ \|   /\ V / | |\__ \     your notes, as a galaxy
   \__/_/ \_\_|_\ \_/ |___|___/
"""


def main():
    args = sys.argv[1:]

    if args and args[0] == "setup":
        # Hand off to the Google sign-in helper.
        import setup_google
        return setup_google.main()

    print(BANNER)
    import server

    # Default to opening the browser; --no-open turns it off.
    forwarded = [a for a in args if a != "--no-open"]
    if "--no-open" not in args and "--open" not in forwarded:
        forwarded.append("--open")
    return server.main(forwarded)


if __name__ == "__main__":
    raise SystemExit(main())
