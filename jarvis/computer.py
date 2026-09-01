#!/usr/bin/env python3
"""Voice control of the user's computer — Windows first, Mac/Linux too.

Every action is an entry on a fixed ALLOWLIST that builds an argv list (never a
shell string), so a spoken phrase can never turn into an arbitrary command. App
names resolve to fixed executables; URLs are validated; media/volume/lock use
documented, injection-free calls. The server keeps this OFF unless config opts in,
and (by default) holds each action behind a "do it" gate before running it.

Standard library only.
"""

import platform
import re
import subprocess
import urllib.parse

SYSTEM = platform.system()            # "Windows", "Darwin", "Linux"
IS_WINDOWS = SYSTEM == "Windows"
IS_MAC = SYSTEM == "Darwin"

# Friendly name -> the executable to launch, per platform. Only these open.
APPS = {
    "notepad":        {"Windows": "notepad",   "Darwin": "TextEdit",       "Linux": "gedit"},
    "calculator":     {"Windows": "calc",       "Darwin": "Calculator",     "Linux": "gnome-calculator"},
    "file explorer":  {"Windows": "explorer",   "Darwin": "Finder",         "Linux": "nautilus"},
    "browser":        {"Windows": "__browser__", "Darwin": "__browser__",    "Linux": "__browser__"},
    "terminal":       {"Windows": "wt",          "Darwin": "Terminal",       "Linux": "x-terminal-emulator"},
    "powershell":     {"Windows": "powershell",  "Darwin": None,             "Linux": None},
    "settings":       {"Windows": "__ms-settings__", "Darwin": "System Settings", "Linux": "gnome-control-center"},
    "task manager":   {"Windows": "taskmgr",     "Darwin": "Activity Monitor", "Linux": "gnome-system-monitor"},
    "paint":          {"Windows": "mspaint",     "Darwin": None,             "Linux": None},
    "calendar":       {"Windows": "__calendar__", "Darwin": "Calendar",      "Linux": None},
    "music":          {"Windows": "__music__",   "Darwin": "Music",          "Linux": None},
}
APP_ALIASES = {
    "files": "file explorer", "explorer": "file explorer", "finder": "file explorer",
    "chrome": "browser", "edge": "browser", "web": "browser", "internet": "browser",
    "calc": "calculator", "cmd": "terminal", "command prompt": "terminal",
    "note": "notepad", "notes": "notepad", "settings app": "settings",
    "task": "task manager",
}

# Windows virtual-key codes for media/volume (sent via keybd_event, no injection).
_VK = {
    "play_pause": 0xB3, "next": 0xB0, "previous": 0xB1,
    "volume_up": 0xAF, "volume_down": 0xAE, "mute": 0xAD,
}
# macOS AppleScript key codes for the same.
_MAC_KEY = {"play_pause": 16, "next": 17, "previous": 18,
            "volume_up": None, "volume_down": None, "mute": None}

_URL_OK = re.compile(r"^https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%\-]+$")


class ComputerError(RuntimeError):
    pass


def normalise_app(name):
    name = (name or "").strip().lower().rstrip(".!?")
    name = re.sub(r"^(the|my|a)\s+", "", name)
    name = re.sub(r"\s+app$", "", name)
    if name in APPS:
        return name
    return APP_ALIASES.get(name)


def normalise_url(value):
    """A safe absolute http(s) URL, or None. Bare domains get https://."""
    value = (value or "").strip().rstrip(".,!?")
    if not value:
        return None
    if not re.match(r"^https?://", value, re.I):
        if re.match(r"^[\w-]+(\.[\w-]+)+(/\S*)?$", value):   # looks like a domain
            value = "https://" + value
        else:
            return None
    return value if _URL_OK.match(value) else None


# ---------------------------------------------------------------------------
# Command builders — each returns an argv list (shell=False)
# ---------------------------------------------------------------------------

def _win_keybd(vk):
    script = (
        "$s='[DllImport(\"user32.dll\")]public static extern void "
        "keybd_event(byte b,byte s,uint f,int e);';"
        "$k=Add-Type -MemberDefinition $s -Name K -Namespace W -PassThru;"
        "$k::keybd_event(%d,0,0,0);$k::keybd_event(%d,0,2,0);" % (vk, vk)
    )
    return ["powershell", "-NoProfile", "-Command", script]


def build_open_app(app, system=None):
    system = system or SYSTEM
    exe = (APPS[app] or {}).get(system)
    if not exe:
        raise ComputerError("I can't open %s on this system, sir." % app)
    if system == "Windows":
        if exe == "__browser__":
            return ["cmd", "/c", "start", "", "https://www.google.com"]
        if exe == "__ms-settings__":
            return ["cmd", "/c", "start", "", "ms-settings:"]
        if exe == "__calendar__":
            return ["cmd", "/c", "start", "", "outlookcal:"]
        if exe == "__music__":
            return ["cmd", "/c", "start", "", "mswindowsmusic:"]
        return ["cmd", "/c", "start", "", exe]
    if system == "Darwin":
        if exe == "__browser__":
            return ["open", "https://www.google.com"]
        return ["open", "-a", exe]
    # Linux
    if exe == "__browser__":
        return ["xdg-open", "https://www.google.com"]
    return [exe]


def build_open_url(url, system=None):
    system = system or SYSTEM
    safe = normalise_url(url)
    if not safe:
        raise ComputerError("That doesn't look like a web address I can trust, sir.")
    if system == "Windows":
        return ["cmd", "/c", "start", "", safe]
    if system == "Darwin":
        return ["open", safe]
    return ["xdg-open", safe]


def build_media(action, system=None):
    system = system or SYSTEM
    if system == "Windows":
        return _win_keybd(_VK[action])
    if system == "Darwin":
        code = _MAC_KEY.get(action)
        if action in ("volume_up", "volume_down", "mute"):
            expr = {"volume_up": "set volume output volume ((output volume of (get volume settings)) + 12)",
                    "volume_down": "set volume output volume ((output volume of (get volume settings)) - 12)",
                    "mute": "set volume output muted true"}[action]
            return ["osascript", "-e", expr]
        if code is not None:
            return ["osascript", "-e", 'tell application "System Events" to key code %d' % code]
    raise ComputerError("I can't do that on this system, sir.")


def build_lock(system=None):
    system = system or SYSTEM
    if system == "Windows":
        return ["cmd", "/c", "rundll32.exe", "user32.dll,LockWorkStation"]
    if system == "Darwin":
        return ["pmset", "displaysleepnow"]
    return ["loginctl", "lock-session"]


# action name -> (human phrase template, argv builder)
def build_command(action, arg, system=None):
    """Return (argv, human_phrase). Raises ComputerError if unbuildable."""
    system = system or SYSTEM
    if action == "open_app":
        return build_open_app(arg, system), "open %s" % arg
    if action == "open_url":
        safe = normalise_url(arg)
        return build_open_url(arg, system), "open %s" % (safe or arg)
    if action in ("play_pause", "next", "previous", "volume_up", "volume_down", "mute"):
        phrase = {"play_pause": "play/pause", "next": "skip to the next track",
                  "previous": "go to the previous track", "volume_up": "turn the volume up",
                  "volume_down": "turn the volume down", "mute": "mute"}[action]
        return build_media(action, system), phrase
    if action == "lock":
        return build_lock(system), "lock the screen"
    raise ComputerError("I don't know how to do that, sir.")


def run(argv, timeout=15):
    """Execute an already-built argv list. shell is never used."""
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise ComputerError("That command isn't available on this machine, sir.")
    except subprocess.TimeoutExpired:
        raise ComputerError("That took too long, sir.")
    if result.returncode != 0:
        raise ComputerError((result.stderr or "It didn't take, sir.").strip()[:200])
    return True


# ---------------------------------------------------------------------------
# Intent parsing
# ---------------------------------------------------------------------------

_OPEN = re.compile(r"^(?:jarvis[,\s]+)?(?:please\s+)?(?:open|launch|start|run|go to|visit)\s+(.+)$", re.I)
_MEDIA = re.compile(r"^(?:jarvis[,\s]+)?(?:please\s+)?(.+)$", re.I)


def parse_command(text):
    """Map a spoken line to (action, arg) or None. Never executes."""
    q = (text or "").strip().rstrip(".!?")
    if not q:
        return None
    low = q.lower()

    # lock
    if re.match(r"^(?:jarvis[,\s]+)?(?:please\s+)?lock\s+(?:the\s+|my\s+)?(?:screen|computer|pc|laptop|it)\b", low):
        return ("lock", None)

    # media transport
    if re.match(r"^(?:jarvis[,\s]+)?(?:please\s+)?(?:play|pause|resume)\b", low):
        return ("play_pause", None)
    if re.match(r"^(?:jarvis[,\s]+)?(?:please\s+)?(?:next|skip)\b", low):
        return ("next", None)
    if re.match(r"^(?:jarvis[,\s]+)?(?:please\s+)?(?:previous|back|last)\s+(?:track|song)\b", low) \
            or low in ("previous track", "previous song", "go back a track"):
        return ("previous", None)
    if re.search(r"\b(?:volume|turn it)\s+up\b", low) or low in ("louder", "turn it up"):
        return ("volume_up", None)
    if re.search(r"\b(?:volume|turn it)\s+down\b", low) or low in ("quieter", "turn it down"):
        return ("volume_down", None)
    if re.match(r"^(?:jarvis[,\s]+)?(?:please\s+)?(?:mute|unmute)\b", low):
        return ("mute", None)

    # open <app or url or site>
    m = _OPEN.match(q)
    if m:
        target = m.group(1).strip()
        url = normalise_url(target)
        if url:
            return ("open_url", target)
        app = normalise_app(target)
        if app:
            return ("open_app", app)
        # "open <something>" we don't recognise — still a computer intent, unresolved
        return ("open_unknown", target)

    return None


def is_command(text):
    parsed = parse_command(text)
    return parsed is not None and parsed[0] != "open_unknown"
