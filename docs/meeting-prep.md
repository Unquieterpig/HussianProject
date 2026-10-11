# Meeting prep: TESTFORGE

Full survey with links and exact numbers: [related-work.md](related-work.md).

## 1. The 30-second version

> TESTFORGE takes a closed GitHub issue, finds the PR that fixed it, and checks
> out the code before and after the fix. An LLM sees only the issue and the
> pre-fix code and writes a test. Both the LLM's test and the maintainer's test
> from the fix PR are then run at both commits. Each suite lands in one of four
> regions: caught the bug (fail→pass), redundant (pass→pass), fails at both,
> or contradicts the fix (pass→fail).
> The question I want to study is how the two compare, and how often the
> *human* test actually catches the bug it ships with.

## 2. Live demo (about 5 minutes)

1. `python run.py`, which opens http://127.0.0.1:8000.
2. Set TARGET REPO to `more-itertools/more-itertools` and ISSUE # to `1250`.
3. Pick a PROVIDER:
   - DeepSeek gives real LLM output (`deepseek-flash`).
   - Demo uses a canned model. If you pick it, **say so**: only the human column is real.
4. Click RUN and talk through the status log: issue → fix PR #1251 → two code trees → model → pytest at both commits.
5. Point at three things in the results panel:
   - the region table and the 2x2 grid showing where each suite landed;
   - `pytest output :: HUMAN (PR)`, which shows `ValueChainTests.test_type_error_while_iterating` failing at the buggy commit;
   - the side-by-side view: LLM test on the left, the maintainer's test diff on the right.

## 3. Pilot data (real, run 2026-10-10)

These are results from five closed more-itertools issues. Only #1250 has an LLM
test so far: DeepSeek `deepseek-flash`, one shot.

| Issue | Fix PR | What the fix PR changed | Human suite | LLM suite |
|---|---|---|---|---|
| #1250 value_chain swallows a TypeError | #1251 | code + tests/test_more.py | caught the bug | caught the bug |
| #1252 split_before/after/when, empty iterable | #1253 | code + tests/test_more.py | caught the bug | not run yet |
| #1257 combination_with_replacement_index and None | #1261 | code + tests/test_more.py | caught the bug | not run yet |
| #1227 convolve, padded zeros for empty inputs | #1231 | docstring only | no test | not run yet |
| #1215 iter_index TypeError on range | #1217 | docstring only | no test file | not run yet |

**#1250 in detail.** DeepSeek wrote one file with 13 tests
(`output/more-itertools-more-itertools/tests/test_value_chain_type_error.py`).
- At the buggy commit: 7 failed and 6 passed. The 7 failures are all the
  tests about a TypeError being swallowed. The 6 passes are the normal-usage
  tests, which shows the failures aren't caused by a broken import.
- At the fixed commit: all 13 passed.
- The maintainer's change to `tests/test_more.py` also went from fail to pass.

So on this issue the model, given only the issue and the pre-fix code, matched
the human test.

Two of the five "fixed" issues were closed without any code change. The PRs
only edited documentation:
- **#1227:** the maintainer added the note *"empty input iterables will produce
  meaningless output"*.
- **#1215:** the maintainer documented a workaround, wrapping the range in
  `iter()`, as a doctest example.

So the specification moved, not the code. That is the specified / programmed /
tested Venn diagram in action: an LLM test that asserts the behaviour the issue
asked for would land in "fails at both". That would not mean the test is wrong;
the maintainers changed the spec instead of the code. TESTFORGE runs test
files only, not doctests in docstrings, so these show as "no test".
SWE-bench-style benchmarks drop issues like these when they build the dataset,
so prior work never sees them (see §4).

This is 5 issues from one repo, so it is an anecdote, not a result. Present it that way.

## 4. Related work in one minute

- **The task is crowded.** Turning an issue into a failing test is well studied:
  - LIBRO (ICSE 2023), SWT-Bench (NeurIPS 2024), Otter (ICML 2025), and Issue2Test and AssertFlip (ICSE 2026).
  - Agentic tools reach roughly 30–63% fail→pass. A single prompt like ours gets 3.6–9.4% on SWT-Bench Lite.
- **The four regions are not new.** SWT-Bench defines exactly F→P, F→F, P→P and P→F per test. Don't claim the classification as novel.
- **Human tests are known to be weak.**
  - SWE-bench+: 31% of "solved" patches pass only because the tests are weak.
  - UTBoost (ACL 2025): 345 wrongly-passed patches.
  - PatchDiff (ICSE 2026): 29.6% of plausible patches behave differently from the gold patch.
  - OpenAI, Feb 2026: 59.4% of 138 audited SWE-bench Verified tasks have flawed tests. OpenAI stopped reporting that benchmark.
- **The gap.** Every benchmark keeps only issues whose human test *does* catch the bug. SWT-Bench: "no golden tests are F→F or P→F". Nobody reports how often maintainer tests are redundant, fail at both commits, contradict the fix, or are missing (like #1227 and #1215). LLM-vs-human comparisons so far only measure coverage, and only on those filtered issues.

## 5. Proposed research questions

- **RQ1.** On *unfiltered* closed issues, where do the maintainers' fix-PR tests land in the four regions, and how often is there no test at all?
- **RQ2.** Given only the issue and the pre-fix code, how often does an LLM write a test that catches the bug? How does that compare to the human tests on the same issues?
- **RQ3.** When the two disagree (LLM catches it and the human test is redundant, or the reverse), why? Answer this by manually categorising the cases.
- **Framing.** Use Jorgensen's specified / programmed / tested Venn diagram as the lens. No paper in this area was found using it.

## 6. Weaknesses to raise before he does

- **Verdicts are per file, not per test function.** A big file like `test_more.py` hides mixed outcomes. Fixable with pytest's per-test report.
- **Fail→pass is not proof.** A human test that imports a new function "fails" before the fix only because of an ImportError. Fix: split fail→pass by failure type, assertion vs error. Otter reports that tests failing pre-fix with an error turn out to be F→P only 3.7% of the time.
- **The prompt leaks the fix location.** The model sees the files the fix touched.
- **Single-shot prompting**, so expect low LLM numbers.
- **Data contamination.** more-itertools is popular and probably in the model's training data.
- **No dependency install**, so only dependency-free repos work. For scale, reuse SWE-bench's Docker environments or limit the study to dependency-free repos.

## 7. Questions to ask him

1. Which question does he want: LLM vs human, the quality of human tests, or the Venn framing itself?
2. What is the target and the timeline: a course report, a workshop paper, or a conference paper?
3. Is Python-only fine? Should we build on SWE-bench / SWT-Bench data or mine our own issues?
4. Which models, and who pays for API usage?
5. How many issues would he consider enough? Prior work uses about 275–500.

## 8. Status: be straight about it

- **Working:**
  - the end-to-end pipeline, including GitHub mining, both trees, pytest at both commits, and the side-by-side UI;
  - the related-work survey;
  - the 5-issue pilot: human tests on all five, the LLM on #1250.
- **Not done yet:**
  - LLM results beyond issue #1250;
  - per-test verdicts;
  - batch runs over many issues.
- **Proposed next 2–3 weeks:**
  - run the LLM on 20–50 issues;
  - per-test verdicts and the failure-type split;
  - a batch mode that writes one CSV row per issue;
  - the first version of the cross-table.
