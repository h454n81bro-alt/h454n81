#!/usr/bin/env python3
"""Test suite for JARVIS. Standard library only.

    python3 tests/test_jarvis.py           # or: python3 -m unittest discover tests
"""

import json
import os
import re
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import build
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
        )
        original = server.call_anthropic

        def fake(config, system, messages, timeout=60):
            self.sent.append({"config": config, "system": system, "messages": messages})
            return "Very good, sir."

        server.call_anthropic = fake
        self.addCleanup(setattr, server, "call_anthropic", original)


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
            graph_js=os.path.join(self.dir, "graph-data.js"))
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
