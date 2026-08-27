# PentestGPT architecture notes

Source: [`GreyDGL/PentestGPT`](https://github.com/GreyDGL/PentestGPT) (read at commit `e8b1bb77d1ac00329675cec3b060aba971ec1ac8`).
PentestGPT is an AI-powered autonomous penetration-testing agent published at USENIX Security 2024;
it is licensed MIT and its own README states it is "for educational purposes and authorized security
testing only." These notes summarize its current repository shape and runtime design for reference —
they are not a copy of the project's internal `docs/architecture.md`, which remains the maintainers'
source of truth.

## Repository family

The maintainers describe three independent Git repositories that make up the full project:

```text
PentestGPT_Project/
├── PentestGPT/          # framework, legacy interactive client, and tool image (this repo)
├── UnifedAgentWrapper/  # canonical unified-agent package
└── xbow-benchmark/      # reference-only benchmark harness and historical results
```

Only `PentestGPT/` was cloned for this review. `UnifedAgentWrapper` is consumed as a pinned external
dependency (see below), and `xbow-benchmark` is explicitly reference-only — the product CLI, CI, and
Docker runtime do not depend on it.

## Maintained runtime: `pentestgpt_agent/`

`pentestgpt_agent/` is the actively maintained autonomous framework — a nested `uv` project
(own `pyproject.toml` and `uv.lock`) under `pentestgpt_agent/src/pentestgpt_agent/`. It implements a
deliberately small two-role loop:

```text
RunSnapshot -> Supervisor -> compile_plan -> one TaskLease
                                             |
TraceStore <- EpisodeRunner <- Executor <----+
     |                              |
     +---- compile_execution -------+
                    |
               MemoryKernel
```

- **Supervisor** (`agents.py`) chooses exactly one ready task, or proposes finishing the run. It
  works only from state supplied to it — target-derived evidence is treated as untrusted data that
  must never be followed as instructions.
- **Executor** (`agents.py`) performs the one leased task and returns a typed result. Task *kind*
  (`DISCOVER`, `ENUMERATE`, `TEST`, `EXPLOIT`, `VERIFY`, `RECOVER` — see `plan.py`) is a hard
  boundary on what it is allowed to do, and outranks the run's overall goal.
- Both roles run with `SandboxPolicy.FULL_ACCESS`; the deployment environment, not an in-process
  sandbox, is the isolation boundary.
- `PentestLoop.run()` (`loop.py`) is the deterministic driver: it opens a run via `MemoryKernel`,
  leases one task at a time, calls Supervisor/Executor, validates their output with `compile_plan` /
  `compile_execution`, and enforces a decision limit (`max_decisions`, default 20) and a per-task
  retry limit (`max_supervisor_attempts`).
- `MemoryKernel` (`memory.py`) is canonical state, backed by SQLite — runs, tasks, observations,
  attempts, and transitions are all durable rows, not provider conversation history. Provider
  transcripts are recorded by `EpisodeRunner`/`TraceStore` (`trace.py`) as diagnostic, append-only
  traces, not as memory.
- `identifiers.py` enforces a strict opaque-ID format (`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`) everywhere
  an externally supplied ID touches a filesystem path, closing off path traversal via task/run IDs.
- `audit.py` provides a read-only SQLite + trace-file auditor for a completed trial; `trial.py` is the
  CLI entry point that wires `MemoryKernel`, `Supervisor`, `Executor`, `TraceStore`, and `PentestLoop`
  together for one run.

There is intentionally no always-on judge, RAG service, speculative backlog, or parallel scheduler —
the project's stated design priority is to keep this at two LLM roles with deterministic code owning
scope validation, leases, evidence provenance, retries, and canonical state.

### Deep modules (interface vs. hidden implementation)

| Module | Interface | Hidden implementation |
|---|---|---|
| `PentestLoop` | `run(RunSpec) -> RunSnapshot` | recovery ordering, retries, episode identity, failure settlement |
| `MemoryKernel` | create/open/snapshot + atomic commits | SQLite schema, transactions, revisions, leases, dependency liveness |
| `compile_plan` | decision + snapshot → valid plan | scope, dependency, phase, completion, size validation |
| `compile_execution` | result + lease + trace → valid execution | exact receipt matching, evidence fallback, identity, recovery rules |
| `EpisodeRunner` | one typed episode → normalized result | provider invocation, durable append-only trace files |
| `UnifiedAgent` (external) | one task over Claude Code or Codex | SDK differences, native options, event normalization |

## Legacy interactive client: `pentestgpt_legacy/`

`pentestgpt_legacy/` is the modernized version of the original USENIX 2024 human-in-the-loop tool,
exposed as the `pentestgpt-legacy` CLI (`main.py`). It runs three cooperating LLM sessions —
reasoning / generation / parsing — that maintain a "Pentesting Task Tree" while a human drives the
session interactively (`next`, `more`, `todo`, `discuss`). Unlike `pentestgpt_agent`, it does **not**
depend on `unified_agent`; it has its own lightweight provider clients under `llm/providers/`
(`anthropic_provider.py`, `gemini_provider.py`, `openai_compatible.py`), fronted by a single
`ModelSpec` registry (`llm/registry.py`) that is the source of truth for supported models across
OpenAI, Anthropic, Gemini, DeepSeek, xAI, Qwen, Moonshot, and local Ollama.

## The `unified-agent` dependency

`pentestgpt_agent` depends on an external package, `unified-agent`, that gives it one interface over
two coding-agent backends (Claude Code and Codex): provider/model/effort/workspace/permission
selection, structured-output invocation, and normalized command/tool/file/session/usage/cost/terminal
events. In `pentestgpt_agent/pyproject.toml` it is pinned to a specific commit of the sibling
`UnifedAgentWrapper` repository:

```toml
unified-agent = { git = "https://github.com/PentestGPT-Project/UnifedAgentWrapper.git", rev = "acff8eeadf93e367d4a1578d3a2739cbc9d3ace5" }
```

A **separate, older copy** lives at the repository root, `unified_agent/`. Nothing in the maintained
runtime imports it — `pentestgpt_agent` uses the pinned external package and `pentestgpt_legacy` uses
its own clients. It is kept only because root packaging and the Docker image still reference it;
the maintainers flag it as an obsolete compatibility copy that should eventually be removed in a
coordinated cleanup (root package metadata, Docker health checks, lockfile, README all need to move
together).

## Runtime and benchmark ownership

- Local framework development runs from `pentestgpt_agent/` via `uv`.
- The root `Dockerfile`/`docker-compose.yml` build a tool image bundling pentest tools plus the
  Claude Code and Codex CLIs (`make docker-build`, `make docker-login`, `make docker-run`), but as of
  this review it does not bake in the maintained `pentestgpt_agent` framework — `make docker-run` is
  pending that wiring.
- `xbow-benchmark` is a historical/reference artifact only. The README cites an 86.5% success rate
  (90/104) on an XBOW validation-suite experiment from December 2025 as a historical research result,
  explicitly not a current regression guarantee, and the project owns no XBOW runner.
- Optional anonymous telemetry (session metadata, tool-usage patterns, flag-detection events — not
  commands, credentials, or flag values) goes to a Langfuse project; it can be disabled with
  `--no-telemetry` or `LANGFUSE_ENABLED=false`.

## Notes for anyone extending this

- New provider/backend behavior belongs behind `UnifiedAgent`, not inside `pentestgpt_agent`.
- New canonical-state behavior belongs behind `MemoryKernel` or the `compile_plan`/`compile_execution`
  compilers, not scattered through `agents.py` or `loop.py`.
- Do not develop new features against the root `unified_agent/` copy — it is dead weight, not the
  dependency surface.
- `pentestgpt_legacy` and `pentestgpt_agent` are independent stacks (different provider clients,
  different memory model); a change to one does not imply a matching change to the other.
