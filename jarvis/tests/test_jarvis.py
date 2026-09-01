#!/usr/bin/env python3
"""Test suite for JARVIS. Standard library only.

    python3 tests/test_jarvis.py           # or: python3 -m unittest discover tests
"""

import base64
import io
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import build
import google_api
import seed_notes
import server


def write(root, rel, text):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path


class TempVault(unittest.TestCase):
    """A tiny hand-built vault, so link rules can be asserted exactly."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="jarvis-test-")
        self.addCleanup(shutil.rmtree, self.dir, True)

    def vault(self):
        write(self.dir, "finance/unit-economics.md",
              "# Unit Economics\n\nGross margin is 38 percent on wholesale. "
              "Green coffee costs 9.80 per kilo. See [[Pricing Strategy]].\n")
        write(self.dir, "finance/pricing-strategy.md",
              "# Pricing Strategy\n\nWe raise prices once a year, in February, "
              "with thirty days notice.\n")
        write(self.dir, "ops/roasting-schedule.md",
              "# Roasting Schedule\n\nWe roast on Tuesday, Thursday and Saturday. "
              "Unit Economics explains why Tuesday is the big day.\n")
        write(self.dir, "ops/lonely-note.md",
              "# Lonely Note\n\nEntirely unrelated musings about houseplants and rain.\n")
        return build.build_graph(self.dir)


# ---------------------------------------------------------------------------
# Prompt 1 — the galaxy
# ---------------------------------------------------------------------------

class TestBuild(TempVault):

    def test_node_id_equals_array_index(self):
        """Everything downstream looks nodes up by index. This must never drift."""
        graph = self.vault()
        for index, node in enumerate(graph["nodes"]):
            self.assertEqual(node["id"], index)

    def test_label_prefers_h1_then_filename(self):
        write(self.dir, "misc/monthly-pl-notes.md", "# Monthly P&L Notes\n\nBody text here.\n")
        write(self.dir, "misc/no-heading-here.md", "Just body text, no heading at all.\n")
        labels = {n["label"] for n in build.build_graph(self.dir)["nodes"]}
        self.assertIn("Monthly P&L Notes", labels)
        self.assertIn("No Heading Here", labels)

    def test_group_is_the_folder(self):
        graph = self.vault()
        groups = {n["label"]: n["group"] for n in graph["nodes"]}
        self.assertEqual(groups["Unit Economics"], "finance")
        self.assertEqual(groups["Roasting Schedule"], "ops")

    def test_excerpt_is_capped_and_stripped_of_markdown(self):
        write(self.dir, "long/wall-of-text.md", "# Wall Of Text\n\n" + ("lorem ipsum " * 400))
        for node in build.build_graph(self.dir)["nodes"]:
            self.assertLessEqual(len(node["excerpt"]), build.EXCERPT_CHARS + 1)
            self.assertNotIn("[[", node["excerpt"])
            self.assertNotIn("#", node["excerpt"])

    def test_wikilink_creates_a_link(self):
        graph = self.vault()
        ids = {n["label"]: n["id"] for n in graph["nodes"]}
        pairs = {(l["source"], l["target"]) for l in graph["links"]}
        a, b = sorted([ids["Unit Economics"], ids["Pricing Strategy"]])
        self.assertIn((a, b), pairs)

    def test_title_mention_creates_a_link(self):
        graph = self.vault()
        ids = {n["label"]: n["id"] for n in graph["nodes"]}
        pairs = {(l["source"], l["target"]) for l in graph["links"]}
        a, b = sorted([ids["Roasting Schedule"], ids["Unit Economics"]])
        self.assertIn((a, b), pairs)

    def test_unrelated_note_stays_unlinked(self):
        graph = self.vault()
        lonely = next(n["id"] for n in graph["nodes"] if n["label"] == "Lonely Note")
        touching = [l for l in graph["links"] if lonely in (l["source"], l["target"])]
        self.assertEqual(touching, [])

    def test_short_words_do_not_match_across_notes(self):
        write(self.dir, "x/tea.md", "# Tea\n\nA short title that appears inside steamy words.\n")
        write(self.dir, "x/steam.md", "# Steam Wands\n\nPurge the steam wands after every drink.\n")
        graph = build.build_graph(self.dir)
        ids = {n["label"]: n["id"] for n in graph["nodes"]}
        pairs = {(l["source"], l["target"]) for l in graph["links"]}
        a, b = sorted([ids["Tea"], ids["Steam Wands"]])
        self.assertNotIn((a, b), pairs, "3-letter title matched inside another word")

    def test_seed_writes_a_usable_vault(self):
        target = os.path.join(self.dir, "seeded")
        count = seed_notes.seed(target)
        self.assertEqual(count, 25)
        graph = build.build_graph(target)
        self.assertEqual(len(graph["nodes"]), 25)
        self.assertGreater(len(graph["links"]), 20)
        degrees = {n["id"]: 0 for n in graph["nodes"]}
        for link in graph["links"]:
            degrees[link["source"]] += 1
            degrees[link["target"]] += 1
        self.assertTrue(all(degrees.values()), "sample vault should have no orphan notes")


class TestGraphOutput(TempVault):

    def test_graph_data_js_shape_and_no_leakage(self):
        write(self.dir, "finance/long-note.md",
              "# Long Note\n\n" + ("filler sentence about coffee. " * 200)
              + "\n\nSECRET-TAIL-BEYOND-THE-EXCERPT\n")
        graph = self.vault()
        out = os.path.join(self.dir, "out", "graph-data.js")
        build.write_graph_js(graph, out)
        text = open(out, encoding="utf-8").read()

        self.assertIn("const GRAPH = ", text)
        payload = json.loads(text[text.index("{"): text.rindex("}") + 1])
        self.assertEqual(len(payload["nodes"]), len(graph["nodes"]))
        self.assertIn("links", payload)

        # Full note text is retrieval material and stays server-side.
        self.assertNotIn("_texts", payload)
        self.assertNotIn("_texts", text)
        # Only the excerpt ships to the browser; the rest of a long note stays server-side.
        self.assertNotIn("SECRET-TAIL-BEYOND-THE-EXCERPT", text)


class TestLiveGrowth(TempVault):

    def test_append_note_keeps_ids_stable_and_finds_the_anchor(self):
        graph = self.vault()
        before = [(n["id"], n["label"]) for n in graph["nodes"]]
        pricing_id = next(n["id"] for n in graph["nodes"] if n["label"] == "Pricing Strategy")

        path = write(self.dir, "captures/a-thought.md",
                     "# A Thought\n\nThe Pricing Strategy should mention the February notice.\n")
        node, anchor = build.append_note(graph, self.dir, path)

        self.assertEqual([(n["id"], n["label"]) for n in graph["nodes"]][:len(before)], before)
        self.assertEqual(node["id"], len(before))
        self.assertEqual(node["group"], "captures")
        self.assertEqual(anchor, pricing_id)
        self.assertEqual(len(graph["_texts"]), len(graph["nodes"]))


# ---------------------------------------------------------------------------
# Prompt 2 — retrieval
# ---------------------------------------------------------------------------

class TestRetrieval(TempVault):

    def test_title_match_outranks_body_match(self):
        graph = self.vault()
        ranked = server.score_notes("what is our pricing strategy", graph)
        top = graph["nodes"][ranked[0][0]]["label"]
        self.assertEqual(top, "Pricing Strategy")

    def test_body_facts_are_findable(self):
        graph = self.vault()
        ranked = server.score_notes("what is the gross margin on wholesale", graph)
        self.assertEqual(graph["nodes"][ranked[0][0]]["label"], "Unit Economics")

    def test_small_talk_matches_nothing(self):
        graph = self.vault()
        for chatter in ["hello", "how are you", "thank you"]:
            relevant = [p for p in server.score_notes(chatter, graph) if p[1] >= server.FLY_THRESHOLD]
            self.assertEqual(relevant, [], "%r should not drag the camera around" % chatter)

    def test_common_title_words_do_not_hijack_retrieval(self):
        """"Cafe Opening Checklist" must not win "why are we not opening a second cafe".

        Both title words are common across the vault; the notes that actually answer
        the question say "second cafe" in so many words.
        """
        seed_notes.seed(self.dir)
        graph = build.build_graph(self.dir)
        ranked = server.score_notes("why are we not opening a second cafe this year", graph)
        top_two = [graph["nodes"][i]["label"] for i, _ in ranked[:2]]
        self.assertNotIn("Cafe Opening Checklist", top_two, top_two)
        self.assertTrue(set(top_two) & {"Cash Flow Forecast", "Business Model Overview"}, top_two)

    def test_a_direct_question_still_finds_its_note(self):
        seed_notes.seed(self.dir)
        graph = build.build_graph(self.dir)
        for question, expected in [
            ("how do I open the cafe in the morning", "Cafe Opening Checklist"),
            ("what is the churn on the subscription box", "Subscription Box"),
            ("which days do we roast", "Roasting Schedule"),
            ("how do we hire baristas", "Hiring Playbook"),
        ]:
            top = graph["nodes"][server.score_notes(question, graph)[0][0]]["label"]
            self.assertEqual(top, expected, "%r -> %r" % (question, top))

    def test_rare_words_outweigh_common_ones(self):
        seed_notes.seed(self.dir)
        graph = build.build_graph(self.dir)
        weights = server.term_weights(graph, ["coffee", "churn"])
        self.assertGreater(weights["churn"], weights["coffee"])

    def test_anaphoric_follow_up_uses_the_previous_question(self):
        """"How far off is that target?" cannot be retrieved from its own words."""
        seed_notes.seed(self.dir)
        graph = build.build_graph(self.dir)
        previous = "What are the three priorities for 2026 and who owns the first one?"
        follow_up = "How far off is that first target?"

        self.assertTrue(server.needs_context(follow_up))
        alone = [graph["nodes"][i]["label"] for i, _ in server.score_notes(follow_up, graph)[:3]]
        with_context = [graph["nodes"][i]["label"]
                        for i, _ in server.score_notes(follow_up, graph, context=previous)[:3]]
        self.assertNotIn("2026 Growth Plan", alone)
        self.assertEqual(with_context[0], "2026 Growth Plan")

    def test_a_fresh_question_is_not_dragged_back_to_the_old_topic(self):
        """The guard on the fix above: context must only apply to real follow-ups."""
        seed_notes.seed(self.dir)
        graph = build.build_graph(self.dir)
        for previous, question, expected in [
            ("what is our pricing strategy", "when do we roast", "Roasting Schedule"),
            ("how do we hire baristas", "what is the churn on the subscription box",
             "Subscription Box"),
            ("tell me about green bean sourcing", "how much cash do we have",
             "Cash Flow Forecast"),
        ]:
            self.assertFalse(server.needs_context(question), question)
            context = previous if server.needs_context(question) else None
            top = graph["nodes"][server.score_notes(question, graph, context=context)[0][0]]["label"]
            self.assertEqual(top, expected, "%r after %r -> %r" % (question, previous, top))

    def test_stopwords_are_ignored(self):
        self.assertEqual(server.tokenise("what is the of and a"), [])
        self.assertEqual(server.tokenise("Wholesale MARGIN"), ["wholesale", "margin"])


class TestHelpers(unittest.TestCase):

    def test_tidy_strips_markdown_because_answers_are_spoken(self):
        messy = "## Heading\n- **bold** point\n- `code` bit\n\n*emphasis*"
        clean = server.tidy(messy)
        for token in ["#", "**", "`", "- "]:
            self.assertNotIn(token, clean)

    def test_capture_titles_do_not_end_mid_phrase(self):
        title = server.title_from("prompt packs make excellent free gifts for the launch")
        self.assertEqual(title, "Prompt packs make excellent free gifts")
        self.assertEqual(server.title_from("to call Cascade about the contract"),
                         "Call Cascade about the contract")

    def test_slug_is_filesystem_safe(self):
        self.assertEqual(server.slugify("Dani's 2026 P&L — review!"), "dani-s-2026-p-l-review")

    def test_backend_resolution(self):
        self.assertEqual(server.resolve_backend(
            {"api_key": "PUT-YOUR-KEY-HERE", "backend": "api"}), "offline")
        self.assertEqual(server.resolve_backend(
            {"api_key": "sk-ant-real", "backend": "auto"}), "api")
        self.assertEqual(server.resolve_backend(
            {"api_key": "sk-ant-real", "backend": "offline"}), "offline")


# ---------------------------------------------------------------------------
# Prompts 2, 4, 5, 6 — the assistant, with a stubbed model
# ---------------------------------------------------------------------------

class StubbedJarvis(TempVault):
    """Deterministic model, so behaviour is asserted rather than the LLM's mood."""

    def setUp(self):
        super(StubbedJarvis, self).setUp()
        self.vault()
        seed_notes.seed(self.dir)
        self.sent = []
        self.jarvis = server.Jarvis(
            self.dir,
            {"api_key": "sk-ant-test", "model": "claude-opus-5", "backend": "api"},
            graph_js=os.path.join(self.dir, "graph-data.js"),
            activity_log=os.path.join(self.dir, "activity.log"),
        )
        original = server.call_anthropic

        def fake(config, system, messages, timeout=60, model=None):
            self.sent.append({"config": config, "system": system, "messages": messages,
                              "model": model})
            return "Very good, sir."

        server.call_anthropic = fake
        self.addCleanup(setattr, server, "call_anthropic", original)


def tiny_png(width=8, height=8, rgb=(200, 30, 30)):
    """A real, valid PNG built with the standard library only."""
    import struct, zlib
    rows = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows))
            + chunk(b"IEND", b""))


class TestGoogleApi(unittest.TestCase):
    """Gmail + Calendar over stdlib, with Google's HTTP layer stubbed."""

    def setUp(self):
        self._orig = urllib.request.urlopen
        self.addCleanup(setattr, urllib.request, "urlopen", self._orig)

    def stub(self, router):
        """router(url, method, data) -> dict; installed as urlopen."""
        def fake(request, timeout=None):
            url = request if isinstance(request, str) else request.full_url
            method = "GET" if isinstance(request, str) else request.method
            data = None if isinstance(request, str) else request.data
            payload = router(url, method, data)

            class Resp(object):
                def __enter__(self_): return self_
                def __exit__(self_, *a): return False
                def read(self_): return json.dumps(payload).encode()
            return Resp()
        urllib.request.urlopen = fake

    def test_is_ready_needs_all_three(self):
        self.assertFalse(google_api.is_ready({}))
        self.assertFalse(google_api.is_ready({"google": {"client_id": "c", "client_secret": "s"}}))
        self.assertFalse(google_api.is_ready(
            {"google": {"client_id": "PUT-YOUR-CLIENT-ID-HERE", "client_secret": "s",
                        "refresh_token": "r"}}))
        self.assertTrue(google_api.is_ready(
            {"google": {"client_id": "c", "client_secret": "s", "refresh_token": "r"}}))

    def test_access_token_uses_the_refresh_grant(self):
        seen = {}

        def router(url, method, data):
            seen["url"] = url
            seen["fields"] = dict(urllib.parse.parse_qsl(data.decode()))
            return {"access_token": "at-123", "expires_in": 3600}

        self.stub(router)
        token = google_api.access_token(
            {"google": {"client_id": "c", "client_secret": "s", "refresh_token": "r"}})
        self.assertEqual(token, "at-123")
        self.assertEqual(seen["url"], google_api.TOKEN_URL)
        self.assertEqual(seen["fields"]["grant_type"], "refresh_token")
        self.assertEqual(seen["fields"]["refresh_token"], "r")

    def test_consent_url_asks_for_offline_readonly_access(self):
        url = google_api.consent_url("cid", "http://127.0.0.1:4711/", "state123")
        params = dict(urllib.parse.parse_qsl(url.split("?", 1)[1]))
        self.assertEqual(params["access_type"], "offline")
        self.assertEqual(params["response_type"], "code")
        self.assertEqual(params["state"], "state123")
        self.assertIn("gmail.readonly", params["scope"])
        self.assertIn("calendar.readonly", params["scope"])

    def test_exchange_code_requires_a_refresh_token(self):
        self.stub(lambda u, m, d: {"access_token": "at"})   # no refresh_token
        with self.assertRaises(google_api.GoogleError):
            google_api.exchange_code("c", "s", "code", "http://127.0.0.1:4711/")

    def test_recent_email_parses_senders_and_subjects(self):
        def router(url, method, data):
            if "messages/" in url:
                return {"snippet": "the body preview", "labelIds": ["UNREAD", "INBOX"],
                        "payload": {"headers": [
                            {"name": "From", "value": "Dani Marlowe <dani@meridian.coffee>"},
                            {"name": "Subject", "value": "Roaster quote"}]}}
            return {"messages": [{"id": "m1"}]}

        self.stub(router)
        emails = google_api.recent_email("at")
        self.assertEqual(len(emails), 1)
        self.assertEqual(emails[0]["from"], "Dani Marlowe")     # name, not the address
        self.assertEqual(emails[0]["subject"], "Roaster quote")
        self.assertTrue(emails[0]["unread"])

    def test_recent_email_handles_a_bare_address(self):
        def router(url, method, data):
            if "messages/" in url:
                return {"snippet": "", "labelIds": [],
                        "payload": {"headers": [{"name": "From", "value": "ops@hotel.com"}]}}
            return {"messages": [{"id": "m1"}]}
        self.stub(router)
        emails = google_api.recent_email("at")
        self.assertEqual(emails[0]["from"], "ops@hotel.com")
        self.assertEqual(emails[0]["subject"], "(no subject)")

    def test_todays_events_formats_times_and_all_day(self):
        def router(url, method, data):
            return {"items": [
                {"summary": "Standup", "location": "Roastery",
                 "start": {"dateTime": "2026-09-01T09:15:00+00:00"}},
                {"summary": "Delivery window", "start": {"date": "2026-09-01"}}]}
        self.stub(router)
        events = google_api.todays_events("at")
        self.assertEqual(len(events), 2)
        self.assertFalse(events[0]["all_day"])
        self.assertEqual(events[0]["summary"], "Standup")
        self.assertTrue(events[1]["all_day"])
        self.assertEqual(events[1]["when"], "all day")

    def test_a_403_tells_the_user_to_re_run_setup(self):
        def fake(request, timeout=None):
            url = request if isinstance(request, str) else request.full_url
            raise urllib.error.HTTPError(url, 403, "forbidden", {}, io.BytesIO(b"{}"))
        urllib.request.urlopen = fake
        with self.assertRaises(google_api.GoogleError) as caught:
            google_api.recent_email("at")
        self.assertIn("setup_google", str(caught.exception))


class TestBriefTrigger(unittest.TestCase):

    def test_greetings_and_commands_trigger(self):
        for q in ["good morning", "good morning Jarvis", "good morning, sir", "brief me",
                  "morning briefing", "what's on today", "what needs me", "any important emails",
                  "any unread messages", "what do I have this morning", "what's on my calendar",
                  "catch me up on my inbox"]:
            self.assertTrue(server.is_brief_query(q), q)

    def test_a_greeting_inside_a_sentence_is_not_a_brief(self):
        for q in ["good morning is a nice greeting for the newsletter",
                  "what is our pricing strategy", "research coffee prices",
                  "what was I doing yesterday", "remember that email marketing works",
                  "what is the email newsletter strategy", "how do I email a wholesale account"]:
            self.assertFalse(server.is_brief_query(q), q)


class TestElevenLabsVoice(unittest.TestCase):
    """The cloned-voice TTS proxy, with ElevenLabs' HTTP layer stubbed."""

    def setUp(self):
        self.calls = []
        self._orig = urllib.request.urlopen

        def fake(request, timeout=None):
            self.calls.append((request.full_url, dict(request.headers), request.method,
                               request.data))
            return self._respond(request)

        urllib.request.urlopen = fake
        self.addCleanup(setattr, urllib.request, "urlopen", self._orig)

    def _respond(self, request):
        outer = self

        class Resp(object):
            def __enter__(self_): return self_
            def __exit__(self_, *a): return False
            headers = {"content-type": "audio/mpeg"}
            def read(self_):
                if "voices" in request.full_url and request.method == "GET":
                    return json.dumps({"voices": [
                        {"voice_id": "v-brit", "name": "George",
                         "labels": {"accent": "British"}},
                        {"voice_id": "v-us", "name": "Rachel",
                         "labels": {"accent": "American"}},
                    ]}).encode()
                return b"ID3\x03\x00FAKE-MP3"
        return Resp()

    def jarvis(self, eleven):
        return server.Jarvis(
            self.dir if hasattr(self, "dir") else "notes",
            {"api_key": "x", "backend": "api", "elevenlabs": eleven},
            graph_js=os.devnull, activity_log=os.devnull)

    def test_no_key_means_tts_is_unavailable(self):
        j = self.jarvis({})
        self.assertFalse(j.tts_status()["available"])
        with self.assertRaises(server.BackendError):
            j.speak("hello")

    def test_a_placeholder_key_is_not_a_key(self):
        j = self.jarvis({"api_key": "PUT-YOUR-KEY-HERE"})
        self.assertFalse(j.tts_status()["available"])

    def test_voices_load_and_the_first_is_the_default(self):
        j = self.jarvis({"api_key": "sk-el-real"})
        status = j.tts_status()
        self.assertTrue(status["available"])
        self.assertEqual(status["voiceId"], "v-brit")
        self.assertEqual([v["name"] for v in status["voices"]], ["George", "Rachel"])

    def test_a_configured_voice_id_wins_over_the_first(self):
        j = self.jarvis({"api_key": "sk-el-real", "voice_id": "v-us"})
        self.assertEqual(j.tts_status()["voiceId"], "v-us")

    def test_speak_returns_audio_and_the_key_travels_as_a_header_only(self):
        j = self.jarvis({"api_key": "sk-el-SECRET"})
        audio, content_type = j.speak("Good evening, sir.")
        self.assertTrue(audio)
        self.assertEqual(content_type, "audio/mpeg")
        tts_calls = [c for c in self.calls if "text-to-speech" in c[0]]
        self.assertTrue(tts_calls)
        url, headers, method, data = tts_calls[-1]
        self.assertEqual(method, "POST")
        self.assertEqual(headers.get("Xi-api-key"), "sk-el-SECRET")
        self.assertNotIn("SECRET", url)                 # never in the URL
        self.assertNotIn(b"SECRET", data)               # never in the body
        self.assertIn("v-brit", url)                    # default voice in the path

    def test_an_explicit_voice_overrides_the_default(self):
        j = self.jarvis({"api_key": "sk-el-real"})
        j.speak("hello", voice_id="v-us")
        self.assertIn("v-us", self.calls[-1][0])

    def test_a_refused_key_becomes_a_polite_error(self):
        j = self.jarvis({"api_key": "sk-el-bad"})

        def refuse(request, timeout=None):
            if "voices" in request.full_url:
                return self._respond(request)
            raise urllib.error.HTTPError(request.full_url, 401, "no", {},
                                         __import__("io").BytesIO(b"{}"))
        urllib.request.urlopen = refuse
        with self.assertRaises(server.BackendError) as caught:
            j.speak("hello")
        self.assertIn("refused", str(caught.exception).lower())

    def test_empty_text_is_refused(self):
        j = self.jarvis({"api_key": "sk-el-real"})
        with self.assertRaises(server.BackendError):
            j.speak("   ")


class TestVisionFrameValidation(unittest.TestCase):
    """Everything the browser sends is untrusted until it decodes."""

    def test_a_real_png_decodes(self):
        raw = server.decode_frame(base64.b64encode(tiny_png()).decode(), "image/png")
        self.assertTrue(raw.startswith(b"\x89PNG"))

    def test_every_supported_type_is_accepted(self):
        payload = base64.b64encode(tiny_png()).decode()
        for media_type in server.VISION_MEDIA_TYPES:
            self.assertTrue(server.decode_frame(payload, media_type))

    def test_a_foreign_media_type_is_refused(self):
        payload = base64.b64encode(tiny_png()).decode()
        for media_type in ["application/pdf", "text/html", "image/svg+xml", "", None]:
            with self.assertRaises(server.BackendError, msg=media_type):
                server.decode_frame(payload, media_type)

    def test_rubbish_base64_is_refused(self):
        for payload in ["not base64!!", "%%%%", "a"]:
            with self.assertRaises(server.BackendError, msg=payload):
                server.decode_frame(payload, "image/png")

    def test_an_empty_frame_is_refused(self):
        for payload in ["", None]:
            with self.assertRaises(server.BackendError):
                server.decode_frame(payload, "image/png")

    def test_an_oversized_frame_is_refused(self):
        huge = base64.b64encode(b"\x00" * (server.VISION_MAX_BYTES + 1024)).decode()
        with self.assertRaises(server.BackendError):
            server.decode_frame(huge, "image/png")


class TestVisionApiRequest(unittest.TestCase):

    def test_the_image_leads_and_the_question_follows(self):
        sent = {}

        def fake(config, payload, timeout):
            sent.update(payload)
            return {"stop_reason": "end_turn",
                    "content": [{"type": "text", "text": "A red square, sir."}]}

        original = server._anthropic_request
        server._anthropic_request = fake
        try:
            text = server.call_anthropic_vision(
                {"api_key": "k"}, "system", "what is this?",
                base64.b64encode(tiny_png()).decode(), "image/png", "claude-opus-5")
        finally:
            server._anthropic_request = original

        self.assertEqual(text, "A red square, sir.")
        content = sent["messages"][0]["content"]
        self.assertEqual(content[0]["type"], "image", "the image must come first")
        self.assertEqual(content[0]["source"]["media_type"], "image/png")
        self.assertEqual(content[1]["type"], "text")
        self.assertEqual(sent["model"], "claude-opus-5")

    def test_an_empty_reply_is_an_error(self):
        original = server._anthropic_request
        server._anthropic_request = lambda c, p, t: {"content": []}
        try:
            with self.assertRaises(server.BackendError):
                server.call_anthropic_vision({"api_key": "k"}, "s", "q", "x", "image/png",
                                             "claude-opus-5")
        finally:
            server._anthropic_request = original


class TestResearchTrigger(unittest.TestCase):
    """Research is an explicit order, so the trigger is anchored to the start."""

    def test_explicit_orders_are_research(self):
        for question, topic in [
            ("research the specialty coffee market", "the specialty coffee market"),
            ("Jarvis, research oat milk pricing", "oat milk pricing"),
            ("look up the current price of green coffee", "the current price of green coffee"),
            ("search the web for espresso machine reviews", "espresso machine reviews"),
            ("google robusta futures", "robusta futures"),
            ("what is the latest on coffee tariffs", "coffee tariffs"),
            ("can you research arabica yields", "arabica yields"),
        ]:
            self.assertEqual(server.extract_research_topic(question), topic, question)
            self.assertTrue(server.is_research_query(question), question)

    def test_notes_questions_are_never_hijacked(self):
        """The third trigger in this project; the first two both over-matched.

        A notes question that merely contains "research" or "latest" must not be
        sent to the web.
        """
        for question in ["what do my notes say about market research",
                         "how much do we spend on research",
                         "what is our pricing strategy",
                         "what is the latest gross margin in my notes",
                         "when do we roast",
                         "what was I doing yesterday",
                         "remember that I should research oat milk"]:
            self.assertIsNone(server.extract_research_topic(question), question)
            self.assertFalse(server.is_research_query(question), question)

    def test_an_order_with_no_topic_is_not_research(self):
        for question in ["research", "look up", "google"]:
            self.assertIsNone(server.extract_research_topic(question), question)


class TestWebSearchWiring(unittest.TestCase):

    def test_tool_version_follows_the_model(self):
        """Dynamic filtering is a 400 on models that lack it — Haiku 4.5 included."""
        for model in ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-fable-5"]:
            self.assertEqual(server.web_search_tool(model)["type"], "web_search_20260209", model)
        for model in ["claude-haiku-4-5", "something-unknown"]:
            self.assertEqual(server.web_search_tool(model)["type"], "web_search_20250305", model)

    def test_every_picker_model_gets_a_usable_tool(self):
        for model in server.MODEL_IDS:
            tool = server.web_search_tool(model)
            self.assertEqual(tool["name"], "web_search")
            self.assertIn("max_uses", tool)

    def test_citations_come_from_search_results_and_text(self):
        blocks = [
            {"type": "web_search_tool_result", "content": [
                {"title": "ICE Coffee C", "url": "https://ice.com/coffee"},
                {"title": "Barchart", "url": "https://barchart.com/kc"},
            ]},
            {"type": "text", "text": "About $3.11.", "citations": [
                {"title": "Reuters", "url": "https://reuters.com/coffee"},
                {"title": "Dup", "url": "https://ice.com/coffee"},   # already seen
            ]},
        ]
        found = server.extract_citations(blocks)
        self.assertEqual([c["url"] for c in found],
                         ["https://ice.com/coffee", "https://barchart.com/kc",
                          "https://reuters.com/coffee"])

    def test_a_search_error_is_not_read_as_a_result(self):
        """On error the block's content is an object, not a list — indexing it blindly
        would turn a failure into a bogus source."""
        blocks = [{"type": "web_search_tool_result",
                   "content": {"type": "web_search_tool_result_error",
                               "error_code": "max_uses_exceeded"}}]
        self.assertEqual(server.extract_citations(blocks), [])

    def test_citation_extraction_survives_junk(self):
        for junk in [None, [], [None], ["not a dict"], [{"type": "text"}],
                     [{"type": "web_search_tool_result", "content": None}],
                     [{"type": "text", "citations": None}]]:
            self.assertEqual(server.extract_citations(junk), [])

    def test_sources_trailer_is_stripped_from_the_spoken_answer(self):
        text, citations = server.split_sources(
            "Roughly $3.11 a pound, sir.\n\nSOURCES: https://ice.com/x https://barchart.com/y")
        self.assertNotIn("SOURCES", text)
        self.assertEqual(text, "Roughly $3.11 a pound, sir.")
        self.assertEqual([c["url"] for c in citations],
                         ["https://ice.com/x", "https://barchart.com/y"])

    def test_inline_links_are_used_when_there_is_no_trailer(self):
        text, citations = server.split_sources(
            "See [Barchart](https://barchart.com/kc) for that, sir.")
        self.assertEqual([c["url"] for c in citations], ["https://barchart.com/kc"])
        self.assertEqual(citations[0]["title"], "Barchart")

    def test_a_spoken_answer_never_keeps_a_markdown_link(self):
        self.assertEqual(server.tidy("See [Python.org](https://python.org) for it, sir."),
                         "See Python.org for it, sir.")


class TestResearchApiRequest(unittest.TestCase):
    """The API research path, which needs a real key to run for real."""

    def run_with(self, responses):
        sent = []
        queue = list(responses)

        def fake(config, payload, timeout):
            sent.append(payload)
            return queue.pop(0)

        original = server._anthropic_request
        server._anthropic_request = fake
        try:
            text, citations = server.call_anthropic_research(
                {"api_key": "k"}, "system", [{"role": "user", "content": "research coffee"}],
                "claude-opus-5")
        finally:
            server._anthropic_request = original
        return text, citations, sent

    def test_request_declares_the_search_tool(self):
        text, citations, sent = self.run_with([{
            "stop_reason": "end_turn",
            "content": [
                {"type": "web_search_tool_result",
                 "content": [{"title": "ICE", "url": "https://ice.com/x"}]},
                {"type": "text", "text": "About $3.11 a pound, sir."},
            ],
        }])
        self.assertEqual(text, "About $3.11 a pound, sir.")
        self.assertEqual([c["url"] for c in citations], ["https://ice.com/x"])
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["tools"][0]["type"], "web_search_20260209")
        self.assertEqual(sent[0]["model"], "claude-opus-5")
        self.assertIn("max_tokens", sent[0])

    def test_pause_turn_is_followed_to_completion(self):
        """A long search pauses mid-turn; stopping there loses the answer."""
        text, citations, sent = self.run_with([
            {"stop_reason": "pause_turn",
             "content": [{"type": "web_search_tool_result",
                          "content": [{"title": "A", "url": "https://a.com"}]}]},
            {"stop_reason": "end_turn",
             "content": [{"type": "text", "text": "The finding, sir."}]},
        ])
        self.assertEqual(text, "The finding, sir.")
        self.assertEqual([c["url"] for c in citations], ["https://a.com"])
        self.assertEqual(len(sent), 2, "the paused turn must be handed back")
        self.assertEqual(sent[1]["messages"][-1]["role"], "assistant")

    def test_a_refusal_is_surfaced_not_swallowed(self):
        original = server._anthropic_request

        def refuse(config, payload, timeout):
            raise server.BackendError("I must decline that one, sir.")

        server._anthropic_request = refuse
        try:
            with self.assertRaises(server.BackendError):
                server.call_anthropic_research({"api_key": "k"}, "s", [], "claude-opus-5")
        finally:
            server._anthropic_request = original

    def test_an_empty_search_is_an_error_not_a_blank_answer(self):
        with self.assertRaises(server.BackendError):
            self.run_with([{"stop_reason": "end_turn", "content": []}])


class TestTimeMachineDates(unittest.TestCase):
    """Pure date parsing — no server, no notes, just the clock."""

    # A fixed Sunday, so "last <weekday>" and "this/last week" have one answer.
    NOW = datetime(2026, 8, 30, 15, 0)

    def r(self, question):
        return server.extract_time_range(question, now=self.NOW)

    def test_today(self):
        got = self.r("what was I doing today?")
        self.assertEqual(got["start"], datetime(2026, 8, 30, 0, 0))
        self.assertEqual(got["end"], datetime(2026, 8, 31, 0, 0))

    def test_yesterday(self):
        got = self.r("what did I do yesterday?")
        self.assertEqual(got["start"], datetime(2026, 8, 29, 0, 0))
        self.assertEqual(got["end"], datetime(2026, 8, 30, 0, 0))

    def test_days_ago(self):
        got = self.r("3 days ago, what did I ask?")
        self.assertEqual(got["start"], datetime(2026, 8, 27, 0, 0))
        self.assertEqual(got["end"], datetime(2026, 8, 28, 0, 0))

    def test_last_weekday(self):
        got = self.r("what happened last Tuesday")
        self.assertEqual(got["start"], datetime(2026, 8, 25, 0, 0))
        self.assertEqual(got["end"], datetime(2026, 8, 26, 0, 0))

    def test_bare_weekday_means_the_past_occurrence(self):
        got = self.r("what did I do on Tuesday")
        self.assertEqual(got["start"], datetime(2026, 8, 25, 0, 0))

    def test_asking_about_todays_own_weekday_goes_back_a_full_week(self):
        """NOW is a Sunday; "on Sunday" cannot mean today — that's just "today"."""
        got = self.r("what did I do on Sunday")
        self.assertEqual(got["start"], datetime(2026, 8, 23, 0, 0))

    def test_explicit_date_both_word_orders(self):
        for phrase in ("what happened August 25", "what happened 25 August", "what happened on the 25th of August"):
            got = self.r(phrase)
            self.assertEqual(got["start"], datetime(2026, 8, 25, 0, 0), phrase)

    def test_explicit_future_date_rolls_back_a_year(self):
        got = self.r("what happened December 20")
        self.assertEqual(got["start"], datetime(2025, 12, 20, 0, 0))

    def test_last_week_is_the_full_prior_week(self):
        got = self.r("what did I do last week")
        self.assertEqual(got["start"], datetime(2026, 8, 17, 0, 0))
        self.assertEqual(got["end"], datetime(2026, 8, 24, 0, 0))

    def test_this_week_runs_to_now_not_the_future(self):
        got = self.r("what did I do this week")
        self.assertEqual(got["start"], datetime(2026, 8, 24, 0, 0))
        self.assertEqual(got["end"], self.NOW)

    def test_no_date_returns_none(self):
        self.assertIsNone(self.r("what did I do"))
        self.assertIsNone(self.r("what was I working on"))


class TestTimeMachineTrigger(unittest.TestCase):

    def test_personal_phrasings_trigger(self):
        for question in ["what was I doing yesterday?", "What did I ask about last Tuesday?",
                         "remind me what I was doing this morning", "catch me up on today",
                         "what did I capture last week"]:
            self.assertTrue(server.is_time_machine_query(question), question)

    def test_notes_questions_do_not_trigger(self):
        """The two regressions this project has already hit: common words matching
        too eagerly. A word like "yesterday" appearing in a business question must
        not be mistaken for the user asking about their own activity.
        """
        for question in ["what happened to Q3 margins", "how much cash do we have",
                         "how many bags did we ship yesterday",
                         "what is the churn on the subscription box",
                         "what did the note say about pricing",
                         "when do we roast"]:
            self.assertFalse(server.is_time_machine_query(question), question)

    def test_what_happened_needs_a_date_to_count(self):
        self.assertFalse(server.is_time_machine_query("what happened"))
        self.assertTrue(server.is_time_machine_query("what happened yesterday"))


class TestPersonalityDials(unittest.TestCase):
    """TARS-style dials: the character is composed, not hard-coded."""

    def test_defaults_are_the_butler(self):
        prompt = server.compose_system_prompt()
        for trait in ["butler", "sir", "razor wit", "two or three sentences"]:
            self.assertIn(trait, prompt.lower())

    def test_dials_actually_change_the_prompt(self):
        deadpan = server.compose_system_prompt({"wit": 0, "brevity": 100, "formality": 0})
        self.assertIn("no jokes", deadpan.lower())
        self.assertIn("one sentence", deadpan.lower())
        self.assertNotIn("butler", deadpan.lower())
        self.assertIn('do not call the user "sir"', deadpan.lower())

        florid = server.compose_system_prompt({"wit": 100, "brevity": 0, "formality": 100})
        self.assertIn("razor wit", florid.lower())
        self.assertIn("five sentences", florid.lower())
        self.assertIn("butler", florid.lower())

    def test_every_band_is_reachable(self):
        seen = set()
        for value in range(0, 101, 5):
            seen.add(server.compose_system_prompt({"wit": value, "brevity": value,
                                                   "formality": value}))
        self.assertEqual(len(seen), 3, "the three bands should give three distinct prompts")

    def test_rubbish_from_the_browser_is_clamped(self):
        for rubbish in [None, "nonsense", {"wit": 999}, {"wit": -5}, {"wit": "high"},
                        {"unknown": 1}, []]:
            dials = server.clamp_dials(rubbish)
            self.assertEqual(set(dials), set(server.DIALS))
            for value in dials.values():
                self.assertTrue(0 <= value <= 100, dials)
        self.assertEqual(server.clamp_dials({"wit": 999})["wit"], 100)
        self.assertEqual(server.clamp_dials({"wit": -5})["wit"], 0)
        self.assertEqual(server.clamp_dials({"wit": "high"}), server.DEFAULT_DIALS)

    def test_the_notes_rules_survive_every_setting(self):
        """No dial may talk the assistant out of grounding or into markdown."""
        for value in (0, 50, 100):
            prompt = server.compose_system_prompt({"wit": value, "brevity": value,
                                                   "formality": value}).lower()
            self.assertIn("only from the notes", prompt)
            self.assertIn("do not invent", prompt)
            self.assertIn("never use markdown", prompt)


class TestModelHotSwap(unittest.TestCase):

    def test_allowlisted_model_is_honoured(self):
        self.assertEqual(server.resolve_model("claude-haiku-4-5", {}), "claude-haiku-4-5")

    def test_unknown_model_falls_back_and_is_never_forwarded(self):
        for rubbish in ["evil-model", "", None, "../../etc/passwd", "claude-opus-5 ; rm -rf /"]:
            self.assertIn(server.resolve_model(rubbish, {}), server.MODEL_IDS)

    def test_config_model_is_the_default(self):
        self.assertEqual(server.resolve_model(None, {"model": "claude-sonnet-5"}),
                         "claude-sonnet-5")

    def test_every_advertised_model_is_resolvable(self):
        for model in server.MODELS:
            self.assertEqual(server.resolve_model(model["id"], {}), model["id"])
            self.assertTrue(model["label"] and model["note"])


class TestAsk(StubbedJarvis):

    def test_answer_carries_sources_and_flies(self):
        result = self.jarvis.ask("what is our wholesale gross margin", "s1")
        self.assertEqual(result["answer"], "Very good, sir.")
        self.assertTrue(result["nodes"])
        self.assertEqual(len(result["nodes"]), len(result["sources"]))
        self.assertIn(result["mode"], ("focus", "cluster"))

    def test_small_talk_does_not_move_the_camera(self):
        result = self.jarvis.ask("good evening", "s1")
        self.assertEqual(result["nodes"], [])
        self.assertEqual(result["mode"], "idle")

    def test_cluster_mode_when_the_answer_is_broad(self):
        result = self.jarvis.ask(
            "how do pricing, unit economics, wholesale and the subscription box fit together", "s1")
        self.assertGreaterEqual(len(result["nodes"]), server.CLUSTER_THRESHOLD)
        self.assertEqual(result["mode"], "cluster")

    def test_retrieval_is_capped_at_top_k(self):
        result = self.jarvis.ask("coffee notes roasting pricing cafe wholesale margin team", "s1")
        self.assertLessEqual(len(self.sent[-1]["messages"][-1]["content"].split("## ")) - 1,
                             server.TOP_K)

    def test_system_prompt_is_the_butler(self):
        self.jarvis.ask("what is our pricing strategy", "s1")
        system = self.sent[-1]["system"].lower()
        for trait in ["butler", "sir", "only from the notes"]:
            self.assertIn(trait, system)

    def test_dials_reach_the_model(self):
        self.jarvis.ask("what is our pricing strategy", "s1",
                        dials={"wit": 0, "brevity": 100, "formality": 0})
        self.assertIn("no jokes", self.sent[-1]["system"].lower())

    def test_model_choice_reaches_the_call_and_the_response(self):
        result = self.jarvis.ask("what is our pricing strategy", "s1",
                                 model="claude-haiku-4-5")
        self.assertEqual(self.sent[-1]["model"], "claude-haiku-4-5")
        self.assertEqual(result["model"], "claude-haiku-4-5")

    def test_a_model_off_the_allowlist_is_ignored(self):
        result = self.jarvis.ask("what is our pricing strategy", "s1", model="evil-model")
        self.assertIn(self.sent[-1]["model"], server.MODEL_IDS)
        self.assertNotEqual(result["model"], "evil-model")

    def test_session_history_is_kept_and_capped(self):
        for i in range(8):
            self.jarvis.ask("question number %d about pricing" % i, "s2")
        history = self.jarvis.sessions["s2"]
        self.assertLessEqual(len(history), server.MAX_HISTORY)
        self.assertEqual(history[0]["role"], "user")
        # Earlier turns are actually replayed to the model.
        self.assertGreater(len(self.sent[-1]["messages"]), 1)

    def test_ask_feeds_the_previous_question_into_retrieval(self):
        self.jarvis.ask("What are the three priorities for 2026?", "s3")
        result = self.jarvis.ask("How far off is that first target?", "s3")
        self.assertIn("2026 Growth Plan", result["sources"])

    def test_sessions_are_isolated(self):
        self.jarvis.ask("pricing strategy", "alice")
        self.jarvis.ask("roasting schedule", "bob")
        self.assertEqual(len(self.jarvis.sessions["alice"]), 2)
        self.assertEqual(len(self.jarvis.sessions["bob"]), 2)

    def test_empty_question_is_handled(self):
        result = self.jarvis.ask("   ", "s1")
        self.assertEqual(result["nodes"], [])

    def test_backend_failure_is_answered_in_character(self):
        def boom(*args, **kwargs):
            raise server.BackendError("The API key in config.json was refused, sir.")
        server.call_anthropic = boom
        result = self.jarvis.ask("what is our pricing strategy", "s1")
        self.assertTrue(result.get("error"))
        self.assertIn("sir", result["answer"])
        self.assertEqual(result["nodes"], [])

    def test_greeting_counts_real_notes(self):
        greeting = self.jarvis.greeting()
        self.assertIn(str(self.jarvis.note_count), greeting)
        self.assertIn("sir", greeting)
        self.assertRegex(greeting, r"Good (morning|afternoon|evening)")


class TestMorningBrief(unittest.TestCase):
    """The brief end to end, with google_api and the model both stubbed."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="jarvis-brief-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        seed_notes.seed(os.path.join(self.dir, "notes"))

        self._saved = (google_api.access_token, google_api.recent_email,
                       google_api.todays_events, server.call_anthropic)
        google_api.access_token = lambda cfg: "at"
        google_api.recent_email = lambda tok, query=None, max_results=8, timeout=30: [
            {"from": "Dani", "subject": "Roaster quote", "snippet": "46k", "unread": True},
            {"from": "Two Rivers", "subject": "Contract", "snippet": "see attached", "unread": True},
        ]
        google_api.todays_events = lambda tok, calendar_id="primary", now=None, timeout=30: [
            {"when": "9:15 AM", "summary": "Standup", "all_day": False, "location": "Roastery"},
        ]
        self.sent = []

        def fake(config, system, messages, timeout=60, model=None):
            self.sent.append({"system": system, "messages": messages})
            return "Good morning, sir. Standup at 9:15; Dani's quote is in."

        server.call_anthropic = fake

        def restore():
            (google_api.access_token, google_api.recent_email,
             google_api.todays_events, server.call_anthropic) = self._saved
        self.addCleanup(restore)

        self.jarvis = server.Jarvis(
            os.path.join(self.dir, "notes"),
            {"api_key": "sk-ant-x", "backend": "api",
             "google": {"client_id": "c", "client_secret": "s", "refresh_token": "r"}},
            graph_js=os.path.join(self.dir, "g.js"),
            activity_log=os.path.join(self.dir, "a.log"))

    def test_brief_returns_answer_and_structured_data(self):
        result = self.jarvis.ask("good morning", "s1")
        self.assertEqual(result["mode"], "brief")
        self.assertEqual(result["nodes"], [], "the brief must not move the galaxy")
        self.assertEqual(len(result["brief"]["emails"]), 2)
        self.assertEqual(len(result["brief"]["events"]), 1)

    def test_the_model_is_briefed_from_real_inbox_data(self):
        self.jarvis.ask("what needs me", "s1")
        prompt = self.sent[-1]["messages"][-1]["content"]
        self.assertIn("Roaster quote", prompt)
        self.assertIn("Standup", prompt)
        self.assertIn("morning brief", self.sent[-1]["system"].lower())

    def test_brief_is_logged_for_the_time_machine(self):
        self.jarvis.ask("good morning", "s1")
        kinds = [e["kind"] for e in self.jarvis.read_activity()]
        self.assertIn("brief", kinds)

    def test_a_google_failure_is_surfaced_in_character(self):
        def boom(cfg):
            raise google_api.GoogleError("Google refused the request (403). Re-run setup_google.py.")
        google_api.access_token = boom
        result = self.jarvis.ask("good morning", "s1")
        self.assertTrue(result.get("error"))
        self.assertIn("setup_google", result["answer"])
        self.assertEqual(result["nodes"], [])

    def test_format_brief_is_readable_and_complete(self):
        text = server.format_brief(
            [{"from": "Dani", "subject": "Quote", "snippet": "46k", "unread": True}],
            [{"when": "9:15 AM", "summary": "Standup", "all_day": False, "location": "Roastery"}],
            datetime(2026, 9, 1, 7, 30))
        self.assertIn("Standup", text)
        self.assertIn("Dani", text)
        self.assertIn("1 unread", text)

    def test_format_brief_handles_an_empty_day(self):
        text = server.format_brief([], [], datetime(2026, 9, 1, 7, 30))
        self.assertIn("nothing scheduled", text)
        self.assertIn("nothing new", text)


class TestTimeMachineActivity(unittest.TestCase):
    """The activity log itself, and the offline (no-LLM) Time Machine answers."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="jarvis-tm-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        seed_notes.seed(os.path.join(self.dir, "notes"))
        self.jarvis = server.Jarvis(
            os.path.join(self.dir, "notes"),
            {"api_key": "x", "backend": "offline"},
            graph_js=os.path.join(self.dir, "g.js"),
            activity_log=os.path.join(self.dir, "activity.log"),
        )

    def test_log_activity_round_trips(self):
        self.jarvis.log_activity("chat", "s1", "what is our pricing strategy", [2, 3])
        entries = self.jarvis.read_activity()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["kind"], "chat")
        self.assertEqual(entries[0]["nodes"], [2, 3])
        self.assertIsInstance(entries[0]["ts"], datetime)

    def test_missing_log_file_reads_as_empty(self):
        self.assertEqual(self.jarvis.read_activity(), [])

    def test_asking_a_notes_question_logs_it(self):
        self.jarvis.ask("what is our wholesale gross margin", "s1")
        entries = self.jarvis.read_activity()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["kind"], "chat")
        self.assertIn("wholesale gross margin", entries[0]["text"])

    def test_remembering_a_thought_logs_it_with_its_node(self):
        result = self.jarvis.remember("remember that the second roaster quote is due Friday")
        entries = self.jarvis.read_activity()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["kind"], "remember")
        self.assertEqual(entries[0]["nodes"], [result["node"]["id"]])

    def test_brief_without_google_says_to_run_setup(self):
        # This offline jarvis has no google block.
        result = self.jarvis.ask("good morning", "s1")
        self.assertEqual(result["mode"], "idle")
        self.assertEqual(result["nodes"], [])
        self.assertIn("setup_google", result["answer"])

    def test_vision_offline_admits_it_cannot_see(self):
        result = self.jarvis.look("what am I looking at?",
                                  base64.b64encode(tiny_png()).decode(), "image/png")
        self.assertEqual(result["mode"], "idle")
        self.assertEqual(result["nodes"], [])
        self.assertIn("sir", result["answer"])

    def test_research_offline_admits_it_cannot_reach_the_web(self):
        result = self.jarvis.ask("research the price of green coffee", "s1")
        self.assertEqual(result["mode"], "idle")
        self.assertEqual(result["citations"], [])
        self.assertEqual(result["nodes"], [], "research must never move the galaxy")
        self.assertIn("sir", result["answer"])

    def test_research_shows_up_in_the_time_machine(self):
        self.jarvis.log_activity("research", "s1", "green arabica prices", [])
        self.jarvis.ask("what is our wholesale gross margin", "s1")
        result = self.jarvis.ask("what was I doing today?", "s1")
        self.assertIn("1 topic researched", result["answer"])

    def test_empty_day_is_answered_honestly(self):
        result = self.jarvis.ask("what did I do yesterday?", "s1")
        self.assertIn("nothing on record", result["answer"].lower())
        self.assertEqual(result["nodes"], [])
        self.assertEqual(result["mode"], "idle")

    def test_a_days_activity_is_summarised_and_lights_the_notes_touched(self):
        self.jarvis.ask("what is our wholesale gross margin", "s1")
        self.jarvis.ask("when do we roast", "s1")
        self.jarvis.remember("remember that Dani wants the roaster quote by Friday")

        result = self.jarvis.ask("what was I doing today?", "s1")
        self.assertIn("2 question", result["answer"])
        self.assertIn("1 note", result["answer"])
        self.assertTrue(result["nodes"], "the notes actually touched should light up")
        self.assertIn("Roaster Quote", " ".join(result["sources"]).title())

    def test_date_filtering_actually_isolates_the_day(self):
        """A logged entry from three days ago must not bleed into "today"."""
        self.jarvis.log_activity("chat", "s1", "an old question about pricing", [2],
                                 when=datetime.now() - timedelta(days=3))
        self.jarvis.ask("what is our wholesale gross margin", "s1")   # today's real activity

        today = self.jarvis.ask("what was I doing today?", "s1")
        self.assertIn("1 question", today["answer"])

        old_day = self.jarvis.ask("what did I do 3 days ago?", "s1")
        self.assertIn("1 question", old_day["answer"])
        self.assertIn("pricing", old_day["answer"].lower())

    def test_time_machine_question_is_not_answered_from_the_notes(self):
        """It must never fall through to the ordinary retrieval path."""
        result = self.jarvis.ask("what was I doing today?", "s1")
        self.assertEqual(result["mode"], "idle")   # nothing logged yet -> honest, not a notes guess

    def test_activity_log_is_trimmed(self):
        original = server.ACTIVITY_KEEP
        server.ACTIVITY_KEEP = 5
        try:
            for i in range(30):
                self.jarvis.log_activity("chat", "s1", "question %d" % i, [])
            with open(self.jarvis.activity_log, encoding="utf-8") as fh:
                line_count = sum(1 for _ in fh)
            # The trim policy fires once past twice the cap, so the resting size
            # fluctuates between ACTIVITY_KEEP and ACTIVITY_KEEP * 2 by design.
            self.assertLessEqual(line_count, server.ACTIVITY_KEEP * 2)
            self.assertLess(line_count, 30, "the log must not simply grow forever")
        finally:
            server.ACTIVITY_KEEP = original


class TestRemember(StubbedJarvis):

    def test_capture_writes_a_real_note_and_grows_the_galaxy(self):
        before = self.jarvis.note_count
        result = self.jarvis.remember(
            "remember that prompt packs make excellent free gifts for the subscription box")

        path = os.path.join(self.jarvis.notes_dir, result["path"])
        self.assertTrue(os.path.isfile(path))
        with open(path, encoding="utf-8") as fh:
            body = fh.read()
        self.assertIn("# Prompt packs make excellent free gifts", body)
        self.assertIn("prompt packs make excellent free gifts", body)

        self.assertEqual(result["total"], before + 1)
        self.assertEqual(result["node"]["id"], before)
        self.assertEqual(result["node"]["group"], "captures")
        self.assertIn("sir", result["answer"])

    def test_capture_anchors_to_the_most_related_note(self):
        result = self.jarvis.remember("remember that the subscription box needs a skip button")
        anchor = self.jarvis.graph["nodes"][result["anchor"]]
        self.assertEqual(anchor["label"], "Subscription Box")
        self.assertTrue(result["links"])

    def test_capture_anchors_by_content_not_only_by_title(self):
        """A captured thought names no note, so title matching alone leaves it floating."""
        result = self.jarvis.remember(
            "remember that the second roaster quote is due from Dani by Friday")
        self.assertIsNotNone(result["anchor"], "capture was left with no anchor")
        self.assertEqual(self.jarvis.graph["nodes"][result["anchor"]]["label"], "2026 Growth Plan")
        self.assertTrue(result["links"])
        self.assertEqual(result["node"]["degree"], len(result["links"]))

    def test_a_capture_about_nothing_stays_unlinked(self):
        result = self.jarvis.remember("remember that my neighbour's dog is called Biscuit")
        self.assertIsNone(result["anchor"])
        self.assertEqual(result["links"], [])

    def test_capture_regenerates_graph_data_js(self):
        self.jarvis.remember("remember that the roasting schedule moves to Wednesday")
        with open(self.jarvis.graph_js, encoding="utf-8") as fh:
            text = fh.read()
        self.assertIn("const GRAPH = ", text)
        self.assertIn("captures", text)

    def test_repeat_captures_do_not_overwrite_each_other(self):
        a = self.jarvis.remember("remember that pricing rises in February")
        b = self.jarvis.remember("remember that pricing rises in February")
        self.assertNotEqual(a["path"], b["path"])
        self.assertEqual(self.jarvis.note_count, len(set(n["path"] for n in self.jarvis.graph["nodes"])))

    def test_empty_capture_is_refused(self):
        for nothing in ["remember that   ", "remember", "   ", "remember to"]:
            self.assertIn("error", self.jarvis.remember(nothing), "accepted %r" % nothing)


# ---------------------------------------------------------------------------
# The HTTP surface
# ---------------------------------------------------------------------------

class TestHttp(TempVault):

    def setUp(self):
        super(TestHttp, self).setUp()
        seed_notes.seed(self.dir)
        os.environ["JARVIS_QUIET"] = "1"
        self.jarvis = server.Jarvis(
            self.dir, {"api_key": "sk-ant-SECRET-DO-NOT-LEAK", "backend": "offline"},
            graph_js=os.path.join(self.dir, "graph-data.js"),
            activity_log=os.path.join(self.dir, "activity.log"))
        self.httpd = server.make_server(self.jarvis, port=0)
        self.port = self.httpd.server_address[1]
        thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def url(self, path):
        return "http://127.0.0.1:%d%s" % (self.port, path)

    def get(self, path):
        request = urllib.request.Request(self.url(path))
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", "replace")

    def post(self, path, payload, raw=None):
        body = raw if raw is not None else json.dumps(payload).encode()
        request = urllib.request.Request(
            self.url(path), data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode())

    # -- static ---------------------------------------------------------
    def test_index_is_served(self):
        status, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("<title>JARVIS", body)
        self.assertIn('src="graph-data.js"', body)

    def test_viewer_assets_are_served(self):
        self.assertEqual(self.get("/vendor/3d-force-graph.min.js")[0], 200)

    def test_unknown_path_is_404(self):
        self.assertEqual(self.get("/nope.html")[0], 404)

    # -- the one rule ---------------------------------------------------
    def test_the_api_key_is_unreachable_from_the_browser(self):
        """Prompt 2's hard requirement: the key never leaves the server."""
        attempts = [
            "/config.json", "/../config.json", "/../../config.json",
            "/%2e%2e/config.json", "/..%2fconfig.json", "/viewer/../config.json",
            "/./../config.json", "/server.py", "/../server.py", "/../build.py",
            "/notes/strategy/2026-growth-plan.md", "/../notes/strategy/2026-growth-plan.md",
        ]
        for path in attempts:
            status, body = self.get(path)
            self.assertEqual(status, 404, "%s was served!" % path)
            self.assertNotIn("SECRET", body)

    def test_the_key_is_in_no_response_body(self):
        for path in ["/", "/graph-data.js", "/api/status"]:
            self.assertNotIn("SECRET", self.get(path)[1])

    # -- api ------------------------------------------------------------
    def test_status_reports_the_real_note_count(self):
        status, body = self.get("/api/status")
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertEqual(payload["notes"], 25)
        self.assertIn("25 notes indexed", payload["greeting"])
        self.assertEqual(len(payload["suggestions"]), 3)
        self.assertIsNone(payload["model"], "offline mode must not advertise a model")

    def test_status_advertises_models_and_dials(self):
        payload = json.loads(self.get("/api/status")[1])
        self.assertIn("brief", payload)
        self.assertFalse(payload["brief"], "offline/no-google server must not offer a brief")
        # This instance is offline, so it must not offer a model picker.
        self.assertEqual(payload["models"], [])
        self.assertIsNone(payload["defaultModel"])
        self.assertEqual(set(payload["dials"]), set(server.DIALS))

    def test_chat_accepts_dials_and_model_over_http(self):
        status, payload = self.post("/chat", {
            "question": "what is the wholesale margin", "session": "http2",
            "dials": {"wit": 0, "brevity": 100, "formality": 0},
            "model": "claude-haiku-4-5",
        })
        self.assertEqual(status, 200)
        self.assertTrue(payload["answer"])

    def test_chat_survives_a_hostile_body(self):
        for body in [{"question": "hi", "dials": "not-a-dict"},
                     {"question": "hi", "dials": {"wit": [1, 2]}},
                     {"question": "hi", "model": 12345},
                     {"question": "hi", "model": {"nested": True}}]:
            status, payload = self.post("/chat", body)
            self.assertEqual(status, 200, body)
            self.assertTrue(payload["answer"], body)

    def test_brief_route_without_google_answers_politely(self):
        status, body = self.get("/brief")
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertTrue(payload["answer"])          # "run setup_google.py", not a crash
        self.assertEqual(payload["nodes"], [])

    def test_time_machine_round_trip_over_http(self):
        self.post("/chat", {"question": "what is the wholesale margin", "session": "tm-http"})
        self.post("/remember", {"text": "remember that the roaster quote is due Friday"})

        status, payload = self.post("/chat", {"question": "what was I doing today?",
                                              "session": "tm-http"})
        self.assertEqual(status, 200)
        self.assertIn("1 question", payload["answer"])
        self.assertIn("1 note", payload["answer"])
        self.assertTrue(payload["nodes"])

    def test_vision_round_trip_over_http(self):
        status, payload = self.post("/vision", {
            "question": "what am I looking at?",
            "image": base64.b64encode(tiny_png()).decode(),
            "media_type": "image/png",
        })
        self.assertEqual(status, 200)
        self.assertTrue(payload["answer"])          # offline backend declines politely
        self.assertEqual(payload["nodes"], [])

    def test_vision_rejects_a_bad_frame_without_crashing(self):
        status, payload = self.post("/vision", {"question": "?", "image": "not base64!!",
                                                "media_type": "image/png"})
        self.assertEqual(status, 200)
        self.assertTrue(payload["answer"])

    def test_chat_round_trip(self):
        status, payload = self.post("/chat", {"question": "what is the wholesale margin",
                                              "session": "http1"})
        self.assertEqual(status, 200)
        self.assertTrue(payload["answer"])
        self.assertIn("nodes", payload)
        self.assertEqual(payload["backend"], "offline")

    def test_remember_round_trip(self):
        status, payload = self.post("/remember",
                                    {"text": "remember that the second roaster arrives in June"})
        self.assertEqual(status, 200)
        self.assertEqual(payload["total"], 26)
        self.assertTrue(os.path.isfile(os.path.join(self.dir, payload["path"])))
        self.assertEqual(json.loads(self.get("/api/status")[1])["notes"], 26)

    def test_remember_with_nothing_to_remember(self):
        status, payload = self.post("/remember", {"text": "remember that"})
        self.assertEqual(status, 400)
        self.assertIn("error", payload)

    def test_malformed_body_is_rejected(self):
        self.assertEqual(self.post("/chat", None, raw=b"not json at all")[0], 400)

    def test_unknown_post_route_is_404(self):
        self.assertEqual(self.post("/launch-missiles", {"x": 1})[0], 404)


# ---------------------------------------------------------------------------
# The Anthropic call itself
# ---------------------------------------------------------------------------

class TestSpeakRoute(TempVault):
    """The /speak route serves audio and never leaks the ElevenLabs key."""

    def setUp(self):
        super(TestSpeakRoute, self).setUp()
        seed_notes.seed(self.dir)
        os.environ["JARVIS_QUIET"] = "1"
        self._orig = urllib.request.urlopen

        orig = self._orig

        def fake(request, timeout=None, **kw):
            url = request if isinstance(request, str) else request.full_url
            if "api.elevenlabs.io" not in url:
                return orig(request, timeout=timeout, **kw)   # real localhost HTTP
            method = "GET" if isinstance(request, str) else request.method

            class Resp(object):
                status = 200
                def __enter__(self_): return self_
                def __exit__(self_, *a): return False
                headers = {"content-type": "audio/mpeg"}
                def read(self_):
                    if "voices" in url:
                        return json.dumps({"voices": [
                            {"voice_id": "v1", "name": "George",
                             "labels": {"accent": "British"}}]}).encode()
                    return b"ID3\x03\x00AUDIODATA"
            return Resp()

        urllib.request.urlopen = fake
        self.addCleanup(setattr, urllib.request, "urlopen", self._orig)

        self.jarvis = server.Jarvis(
            self.dir, {"api_key": "sk-ant-x", "backend": "api",
                       "elevenlabs": {"api_key": "sk-el-TOPSECRET"}},
            graph_js=os.path.join(self.dir, "graph-data.js"),
            activity_log=os.path.join(self.dir, "activity.log"))
        self.httpd = server.make_server(self.jarvis, port=0)
        self.port = self.httpd.server_address[1]
        thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def url(self, path):
        return "http://127.0.0.1:%d%s" % (self.port, path)

    def test_status_advertises_the_voice_without_the_key(self):
        with urllib.request.urlopen(self.url("/api/status"), timeout=10) as r:
            body = r.read().decode()
        self.assertNotIn("TOPSECRET", body)
        payload = json.loads(body)
        self.assertTrue(payload["tts"]["available"])
        self.assertEqual(payload["tts"]["voiceId"], "v1")

    def test_speak_returns_audio_bytes(self):
        request = urllib.request.Request(
            self.url("/speak"), data=json.dumps({"text": "Good evening, sir."}).encode(),
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=15) as r:
            self.assertEqual(r.status, 200)
            self.assertTrue(r.headers["Content-Type"].startswith("audio"))
            audio = r.read()
        self.assertTrue(audio.startswith(b"ID3"))
        self.assertNotIn(b"TOPSECRET", audio)

    def test_speak_failure_is_a_json_error_to_fall_back_on(self):
        # Point the key at a 401 so the browser gets JSON, not audio, and can
        # fall back to the browser voice.
        orig = self._orig

        def refuse(request, timeout=None, **kw):
            url = request if isinstance(request, str) else request.full_url
            if "api.elevenlabs.io" not in url:
                return orig(request, timeout=timeout, **kw)
            raise urllib.error.HTTPError(url, 401, "no", {}, io.BytesIO(b"{}"))
        urllib.request.urlopen = refuse
        request = urllib.request.Request(
            self.url("/speak"), data=json.dumps({"text": "hi"}).encode(),
            headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(request, timeout=15)
            self.fail("expected an HTTP error")
        except urllib.error.HTTPError as exc:
            self.assertEqual(exc.code, 503)
            payload = json.loads(exc.read().decode())
            self.assertIn("error", payload)


class TestAnthropicRequest(unittest.TestCase):

    def call(self, response_body, status=200, config=None):
        captured = {}

        class FakeResponse(object):
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *a): return False
            def read(self_inner): return json.dumps(response_body).encode()

        def fake_urlopen(request, timeout=None):
            captured["url"] = request.full_url
            captured["headers"] = {k.lower(): v for k, v in request.headers.items()}
            captured["body"] = json.loads(request.data.decode())
            if status != 200:
                raise urllib.error.HTTPError(
                    request.full_url, status, "err", {}, io_bytes(b"{}"))
            return FakeResponse()

        def io_bytes(raw):
            import io
            return io.BytesIO(raw)

        original = urllib.request.urlopen
        urllib.request.urlopen = fake_urlopen
        try:
            text = server.call_anthropic(
                config or {"api_key": "sk-ant-test", "model": "claude-opus-5"},
                "system prompt", [{"role": "user", "content": "hello"}])
        finally:
            urllib.request.urlopen = original
        return text, captured

    def test_request_shape(self):
        text, captured = self.call({"content": [{"type": "text", "text": "Very good, sir."}],
                                    "stop_reason": "end_turn"})
        self.assertEqual(text, "Very good, sir.")
        self.assertEqual(captured["url"], server.API_URL)
        self.assertEqual(captured["headers"]["x-api-key"], "sk-ant-test")
        self.assertEqual(captured["headers"]["anthropic-version"], server.ANTHROPIC_VERSION)
        self.assertEqual(captured["body"]["model"], "claude-opus-5")
        self.assertEqual(captured["body"]["system"], "system prompt")
        self.assertIn("max_tokens", captured["body"])

    def test_thinking_blocks_are_skipped(self):
        text, _ = self.call({"content": [{"type": "thinking", "thinking": "hmm"},
                                         {"type": "text", "text": "The answer, sir."}],
                             "stop_reason": "end_turn"})
        self.assertEqual(text, "The answer, sir.")

    def test_refusal_becomes_a_polite_decline(self):
        with self.assertRaises(server.BackendError):
            self.call({"content": [], "stop_reason": "refusal"})

    def test_bad_key_is_explained(self):
        with self.assertRaises(server.BackendError) as caught:
            self.call({}, status=401)
        self.assertIn("config.json", str(caught.exception))

    def test_rate_limit_is_explained(self):
        with self.assertRaises(server.BackendError) as caught:
            self.call({}, status=429)
        self.assertIn("rate limited", str(caught.exception).lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
