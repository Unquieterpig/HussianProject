# TESTFORGE

Turns a GitHub issue into a bug-reproducing test, then checks whether that
test actually catches the bug.

Give it a public repo and an issue number. It reads the issue, finds the buggy
file, asks a language model for a test, and runs that test at the commit before
the fix and the commit after. A test that fails before and passes after caught
the bug. The same run also executes the human-written test from the fix PR, so
the model's test and the maintainer's test are scored side by side.

Any OpenAI-compatible model is a drop-in (DeepSeek by default, OpenAI, Claude,
a local server, or an offline mock). The UI is an ASCII terminal with a live
status log and progress bar.

```
+---------+   +-----------+   +-------------+   +---------+   +------------------+
|  issue  |-> |  fix PR   |-> |  buggy and  |-> |   LLM   |-> |  run at both     |
|  #1250  |   |  (merged) |   | fixed trees |   |  writes |   |  commits, score  |
|         |   |           |   |             |   |  a test |   |  LLM vs human    |
+---------+   +-----------+   +-------------+   +---------+   +------------------+
```

## Quick start

```bash
pip install -r requirements.txt
copy .env.example .env      # cp on macOS/Linux; set DEEPSEEK_API_KEY, optionally GITHUB_TOKEN
python run.py               # opens http://127.0.0.1:8000
```

No API key? Pick the **Demo** provider and everything runs with a canned model.
`GITHUB_TOKEN` is optional; without it GitHub allows 60 requests an hour and an
issue run uses about seven.

## Using it

1. Enter `owner/repo`.
2. Click **ISSUE #** to list the repo's open and closed issues, and pick one.
3. Choose a provider and model, then **RUN GENERATION**.

**Closed issue** (the evaluation case). TESTFORGE finds the merged PR that
references the issue, downloads the tree before and after the fix, shows the
model the issue plus the files the fix touched as they were before the fix,
and runs both the model's tests and the PR's own test files at both commits.
Each suite lands in one region:

| base | head | region              | meaning                                   |
|------|------|---------------------|-------------------------------------------|
| FAIL | PASS | caught the bug      | reproduces the issue, the fix resolves it |
| PASS | PASS | redundant           | never touched the bug                     |
| FAIL | FAIL | fails at both       | wrong API or wrong behaviour              |
| PASS | FAIL | contradicts the fix | tests the old behaviour                   |

These are the regions of the specified / programmed / tested Venn diagram: the
issue is what is specified, the code is what is programmed, and a good test
sits where all three overlap.

The results panel shows the region table, a 2x2 grid with each suite placed
in its cell, the pytest output behind every verdict, and the model's tests
side by side with the diff of the PR's test file (what the maintainer added).

**Open issue** (the use case). No fix exists yet, so the model's test only runs
on the current code and is reported as failing (as it should) or passing
(missed the bug).

**No issue number.** Plain mode: picks the most relevant source files within
the MAX FILES / MAX KB budget and generates ordinary tests for them. VERIFY
runs them once against the current code.

Generated tests appear with COPY / DOWNLOAD and are written to
`./output/<owner>-<repo>/`.

## Limits

- Runs are Python and pytest only, and no dependencies are installed, so a
  repo with third-party imports reports `did not run`. Dependency-free repos
  such as more-itertools work end to end.
- Locating the buggy file for an open issue is a heuristic: files the issue
  names, or files defining an identifier the issue mentions.
- The first merged PR that references the issue is taken as the fix.
- Tests run on this machine with no sandbox. Keep the server local.

## Layout

```
backend/
  main.py          FastAPI: /api/providers, /api/models, /api/issues, /api/generate
  pipeline/
    issues.py      issue mode: issue -> fix PR -> both trees -> run and score
    runner.py      plain mode and the shared LLM streaming loop
    repo.py        GitHub zipball download, no git binary needed
    selector.py    budgeted file selection
    prompt.py      prompt construction
    parser.py      model text -> test files
    verify.py      pytest in a temp dir
  providers/       LLMProvider interface: OpenAI-compatible, Anthropic, mock
frontend/          index.html  style.css  app.js
run.py             launcher
```

## Adding a model

Any `/chat/completions` endpoint works: choose **Custom**, set BASE URL and the
model name, and put the key in `.env` as `CUSTOM_API_KEY`. For an in-process
backend, subclass `LLMProvider` in `backend/providers/base.py` and register it
in `registry.py`.
