# TESTFORGE

An LLM test-case generator for a summer research project. Point it at a public
GitHub repo; it pulls the source, selects the most relevant files, prompts a
language model, and streams back runnable test cases — with a live status log
and an ASCII progress bar.

Built so that **any** OpenAI-compatible model is a drop-in: DeepSeek (default),
OpenAI, a local server, or our own SWT-Bench scaffold once it exists. Swapping
models is just a base URL + model name.

```
+-----------+    +----------+    +----------+    +-----------+    +---------+
|  GitHub   | -> |  select  | -> |  prompt  | -> |   LLM     | -> |  parse  |
|   repo    |    |  files   |    |  build   |    | (stream)  |    |  tests  |
+-----------+    +----------+    +----------+    +-----------+    +---------+
        every stage streams status -> the UI log + progress bar
```

## Quick start

```bash
# 1. install deps (Python 3.10+)
pip install -r requirements.txt

# 2. add your key
copy .env.example .env        # Windows  (cp on macOS/Linux)
#   then edit .env and set DEEPSEEK_API_KEY=...

# 3. run
python run.py
#   opens http://127.0.0.1:8000
```

No key yet? Choose the **Demo / Mock** provider in the UI — the whole pipeline
and interface run end-to-end with a canned model, no network or spend.

## Using it

1. Enter a repo: `owner/repo` or a full `https://github.com/owner/repo` URL.
2. Pick a provider + model (DeepSeek is default; `deepseek-reasoner` also shows
   its chain-of-thought in the MODEL STREAM panel).
3. Hit **RUN GENERATION**. Watch the status log + progress bar; generated test
   files appear at the bottom with COPY / DOWNLOAD, and are also written to
   `./output/<owner>-<repo>/` (toggle off with the WRITE TESTS checkbox).

### Options worth knowing
- **MAX FILES / MAX KB** — the budget for how much source goes to the model.
  Real repos are huge; the selector scores files (dominant language, density of
  definitions, shallow non-vendored paths) and keeps the best within budget.
- **INCLUDE GLOBS** — force specific files in, e.g. `src/*.py, lib/**/*.ts`.
- **SWT-BENCH MODE** — instructs the model to write tests that fail on buggy
  code and pass once fixed (the SWT-Bench fail-to-pass criterion).
- **VERIFY (RUN PYTEST)** — actually runs the generated tests against the
  downloaded repo in a temp dir and logs the pytest exit code. Python repos
  only, and it runs the generated files only, never the repo's own suite.
  ⚠ This executes model-written code on your machine with no sandbox — keep the
  server local. No dependencies are installed, so a repo with third-party
  imports will fail at collection (exit 2); that is still the signal that
  separates a real test from a hallucinated one.

## Plugging in our own model (the research path)

The whole point of the provider abstraction: when our scaffolded SWT-Bench
system is ready, serve it behind an OpenAI-compatible `/chat/completions`
endpoint (vLLM, Ollama in OpenAI mode, or a thin FastAPI wrapper), then in the
UI choose **Custom / Your scaffold**, set:

- **BASE URL** = `https://your-scaffold.example/v1`
- **MODEL** = whatever name your server expects
- **API KEY** = paste here, or set `CUSTOM_API_KEY` in `.env`

No app code changes. To compare arms (Devstral-Small-2, Qwen2.5-Coder-32B, etc.)
just point the base URL at each server in turn.

If you'd rather call a scaffold **in-process** (Python, no HTTP), subclass
`LLMProvider` in `backend/providers/base.py` and register it in
`backend/providers/registry.py` — that's the only place that maps a provider id
to an implementation.

## Layout

```
backend/
  main.py              FastAPI app: /api/providers, /api/generate (NDJSON stream)
  config.py            provider presets + key resolution
  models.py            request schema
  providers/
    base.py            LLMProvider interface  (subclass to add a backend)
    openai_compatible.py   DeepSeek / OpenAI / custom endpoints
    mock.py            offline demo provider
    registry.py        id -> provider instance
  pipeline/
    repo.py            GitHub zip download + extract (no git binary needed)
    selector.py        budgeted source-file selection
    prompt.py          system + user message construction
    parser.py          model text -> test files (+ write to ./output)
    verify.py          runs generated tests via pytest in a temp dir
    runner.py          orchestrates stages, emits UI events
frontend/
  index.html  style.css  app.js     ASCII monochrome terminal UI
run.py                   launcher (uvicorn)
```

## Notes / limits (v0.1)
- Sends raw source in the prompt; mind context limits and API spend. The token
  estimate in the status log is rough (chars/4).
- File selection is heuristic, not semantic retrieval — fine for a first pass.
- VERIFY runs the tests against the repo's *current* code only. The real
  fail-to-pass check needs two runs (buggy vs patched), which needs SWT-Bench
  instance data with a gold patch rather than a bare GitHub URL — that is the
  next milestone.
