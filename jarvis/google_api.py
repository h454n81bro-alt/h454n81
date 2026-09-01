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
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]

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

def consent_url(client_id, redirect_uri, state):
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
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


def _clean_sender(value):
    """"Dani Marlowe <dani@x.com>" -> "Dani Marlowe"."""
    value = (value or "").strip()
    if "<" in value:
        name = value.split("<", 1)[0].strip().strip('"')
        return name or value.split("<", 1)[1].rstrip(">")
    return value


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
        out.append({
            "from": _clean_sender(_header(headers, "From")),
            "subject": _header(headers, "Subject") or "(no subject)",
            "snippet": (detail.get("snippet") or "").strip(),
            "unread": "UNREAD" in (detail.get("labelIds") or []),
        })
    return out


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------

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
