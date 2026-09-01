#!/usr/bin/env python3
"""Google (Gmail + Calendar) over the standard library only — no pip installs.

OAuth2 and both REST APIs are just HTTPS with a Bearer token, so this speaks raw
urllib rather than pulling in google-api-python-client. It is used by server.py
for the morning brief, and by setup_google.py for the one-time consent flow.

Nothing here ever sends a credential to the browser: the server holds the tokens
and hands the browser only the finished briefing.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_LIST = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
GMAIL_GET = "https://gmail.googleapis.com/gmail/v1/users/me/messages/%s"
CALENDAR_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/%s/events"

# Read-only: this feature never sends mail or edits a calendar.
# Read-only by default. gmail.compose is added only when the user opts into
# "agent hands" (draft writing) during setup — it is the one write scope here,
# and even then JARVIS only ever creates a DRAFT, never sends.
READ_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]
COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose"
SCOPES = READ_SCOPES                       # back-compat default (read-only)

GMAIL_DRAFTS = "https://gmail.googleapis.com/gmail/v1/users/me/drafts"

PLACEHOLDERS = {"", None, "PUT-YOUR-CLIENT-ID-HERE", "PUT-YOUR-CLIENT-SECRET-HERE"}


class GoogleError(RuntimeError):
    pass


def config_block(config):
    return dict(config.get("google") or {})


def is_ready(config):
    g = config_block(config)
    return (g.get("client_id") not in PLACEHOLDERS
            and g.get("client_secret") not in PLACEHOLDERS
            and bool(g.get("refresh_token")))


def _post_form(url, fields, timeout=30):
    data = urllib.parse.urlencode(fields).encode("utf-8")
    request = urllib.request.Request(
        url, data=data, headers={"content-type": "application/x-www-form-urlencoded"},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise GoogleError("Google auth returned %s: %s" % (exc.code, detail))
    except urllib.error.URLError as exc:
        raise GoogleError("Cannot reach Google — %s" % exc.reason)


def _get_json(url, access_token, timeout=30):
    request = urllib.request.Request(
        url, headers={"authorization": "Bearer " + access_token}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        if exc.code in (401, 403):
            raise GoogleError("Google refused the request (%s). Re-run setup_google.py."
                              % exc.code)
        raise GoogleError("Google API returned %s: %s" % (exc.code, detail))
    except urllib.error.URLError as exc:
        raise GoogleError("Cannot reach Google — %s" % exc.reason)


# ---------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------

def consent_url(client_id, redirect_uri, state, scopes=None):
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes or READ_SCOPES),
        "access_type": "offline",      # we want a refresh token
        "prompt": "consent",           # force a refresh token even on re-auth
        "state": state,
    }
    return AUTH_URL + "?" + urllib.parse.urlencode(params)


def exchange_code(client_id, client_secret, code, redirect_uri):
    """Trade the one-time auth code for tokens. Returns the token dict."""
    tokens = _post_form(TOKEN_URL, {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    })
    if "refresh_token" not in tokens:
        raise GoogleError("Google did not return a refresh token. Revoke prior access "
                          "and try again with prompt=consent.")
    return tokens


def access_token(config):
    """A fresh access token from the stored refresh token."""
    g = config_block(config)
    tokens = _post_form(TOKEN_URL, {
        "client_id": g.get("client_id"),
        "client_secret": g.get("client_secret"),
        "refresh_token": g.get("refresh_token"),
        "grant_type": "refresh_token",
    })
    token = tokens.get("access_token")
    if not token:
        raise GoogleError("Google issued no access token — the refresh token may be revoked.")
    return token


# ---------------------------------------------------------------------------
# Gmail
# ---------------------------------------------------------------------------

def _header(headers, name):
    for h in headers or []:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _split_sender(value):
    """"Dani Marlowe <dani@x.com>" -> ("Dani Marlowe", "dani@x.com")."""
    value = (value or "").strip()
    if "<" in value and ">" in value:
        name = value.split("<", 1)[0].strip().strip('"')
        addr = value.split("<", 1)[1].split(">", 1)[0].strip()
        return (name or addr), addr
    return value, value


def _clean_sender(value):
    return _split_sender(value)[0]


def recent_email(token, query="is:unread -category:promotions -category:social",
                 max_results=8, timeout=30):
    """Recent messages as [{from, subject, snippet, unread}]. Newest first."""
    url = GMAIL_LIST + "?" + urllib.parse.urlencode(
        {"q": query, "maxResults": max_results})
    listing = _get_json(url, token, timeout=timeout)
    out = []
    for stub in listing.get("messages", [])[:max_results]:
        detail = _get_json(
            (GMAIL_GET % stub["id"]) + "?" + urllib.parse.urlencode(
                [("format", "metadata"),
                 ("metadataHeaders", "From"), ("metadataHeaders", "Subject")]),
            token, timeout=timeout)
        headers = (detail.get("payload") or {}).get("headers", [])
        name, address = _split_sender(_header(headers, "From"))
        out.append({
            "from": name,
            "email": address,
            "subject": _header(headers, "Subject") or "(no subject)",
            "snippet": (detail.get("snippet") or "").strip(),
            "unread": "UNREAD" in (detail.get("labelIds") or []),
        })
    return out


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------

def create_draft(token, to, subject, body, timeout=30):
    """Create a Gmail DRAFT (never sends). Returns the draft id.

    Needs the gmail.compose scope; a 403 means the user connected read-only and
    must re-run setup_google.py with agent hands enabled.
    """
    import base64
    if not to:
        raise GoogleError("There is no one to address that to, sir.")
    raw_message = "To: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s" % (
        to, subject or "", body or "")
    encoded = base64.urlsafe_b64encode(raw_message.encode("utf-8")).decode("ascii")
    payload = json.dumps({"message": {"raw": encoded}}).encode("utf-8")
    request = urllib.request.Request(
        GMAIL_DRAFTS, data=payload,
        headers={"authorization": "Bearer " + token, "content-type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body_json = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        if exc.code in (401, 403):
            raise GoogleError("Google won't let me write drafts (%s). Re-run "
                              "setup_google.py and enable agent hands." % exc.code)
        raise GoogleError("Google API returned %s: %s" % (exc.code, detail))
    except urllib.error.URLError as exc:
        raise GoogleError("Cannot reach Google — %s" % exc.reason)
    return body_json.get("id", "")


def _rfc3339(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def todays_events(token, calendar_id="primary", now=None, timeout=30):
    """Events between now and end of local day as [{when, summary, all_day, location}]."""
    now = now or datetime.now().astimezone()
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=0)
    url = (CALENDAR_EVENTS % urllib.parse.quote(calendar_id)) + "?" + urllib.parse.urlencode({
        "timeMin": _rfc3339(now),
        "timeMax": _rfc3339(end_of_day),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 12,
    })
    body = _get_json(url, token, timeout=timeout)
    out = []
    for event in body.get("items", []):
        start = event.get("start") or {}
        if start.get("dateTime"):
            try:
                when = datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
                label = when.astimezone().strftime("%-I:%M %p").lstrip("0")
            except ValueError:
                label = start["dateTime"]
            all_day = False
        else:
            label = "all day"
            all_day = True
        out.append({
            "when": label,
            "summary": event.get("summary") or "(untitled)",
            "all_day": all_day,
            "location": event.get("location", ""),
        })
    return out
