# TESTFORGE — Related Work (verified)

Compiled 2026-10-10. Every number below comes from the paper's arXiv abstract or HTML full text, the ACL Anthology page, or the official blog/leaderboard linked in that entry. Anything not confirmed at the source is marked **[unverified]**. Venues come from proceedings or conference program pages. "arXiv preprint" means no peer-reviewed venue was found.

Shorthand: F→P = fails on the pre-fix commit and passes on the post-fix commit. These are TESTFORGE's four regions:

| F→P | P→P | F→F | P→F |
|---|---|---|---|
| caught the bug | redundant | fails at both | contradicts the fix |

---

## 0. TL;DR for the professor meeting

1. **The four-region F→P / P→P / F→F / P→F classification already exists.** SWT-Bench (NeurIPS 2024) defines exactly these four transitions per test and uses them as its metric. It also reports them for the golden (human) tests. TESTFORGE's novelty cannot be the classification itself. It can be the Jorgensen Venn framing and a head-to-head of *issue-only LLM tests* against *the fix PR's human tests* on unfiltered issues (see §5).
2. **The tests in issue benchmarks are known to be weak or flawed.** The main sources:
   - SWE-bench+: 31.08% of "passed" patches are suspicious because of weak tests.
   - UTBoost (ACL 2025): 345 wrongly-passed patches.
   - PatchDiff (ICSE 2026): 29.6% of plausible patches behave differently from the gold patch.
   - SWE-ABS (2026): 19.71% of passing patches rejected.
   - OpenAI (Feb 2026): 59.4% of 138 audited hard Verified tasks have flawed tests or descriptions. OpenAI stopped reporting SWE-bench Verified.
3. **LLM-vs-human test comparisons so far are mostly about coverage.** TDD-Bench Verified and Otter find that LLM F→P tests reach about 0.91–0.95 coverage of the changed code, statistically indistinguishable from developer tests. SWT-Bench finds golden tests cover 72.0% of the patch vs 27.6% for the best agent overall. No paper found compares the *fault-revealing strength* of issue-only LLM tests against the fix-PR human tests on the same issue.
4. **The state of the art is far above a single-shot prompt.**
   - Single-shot baselines on SWT-Bench Lite: 3.6–9.4% (GPT-4).
   - Specialized agents (2025–26), as reported in their papers: 30–63% F→P.
   - Leaderboard "news" entries: up to 84–89% (script mode or company submissions).
5. **F→P on its own is not proof that a test "caught the bug".** "Beyond Fail-to-Pass" (2026) shows many F→P tests are *lax*: they still admit plausible but wrong patches. Otter shows that tests failing pre-fix with an *error* (rather than an assertion failure) are F→P only 3.7% of the time. Both matter for TESTFORGE's "caught the bug" region and for its open-issue mode.

---

## 1. Issue / bug report → reproducing-test generation

### Overview table

| Work | Venue | Data / language | Headline result (exact, from paper) |
|---|---|---|---|
| LIBRO | ICSE 2023 | Defects4J, Java | 251/750 (33%) bugs reproduced; 32% on 31 post-cutoff reports |
| Plein et al. | ICSE 2024 Companion (poster) | Defects4J, Java | ChatGPT single generation: 15% executable, 6% relevant (F→P) |
| SWT-Bench | NeurIPS 2024 | 1,983 instances / Lite 276, Python | Best (SWE-Agent+, GPT-4): S = 18.5%, F→P = 19.2% on Lite |
| TDD-Bench Verified / Auto-TDD | arXiv preprint 2024 | 449 issues, Python | Auto-TDD (GPT-4o): 23.6% F→P |
| AEGIS | FSE 2025 Industry | SWE-bench Lite (300), Python | 36.0% F→P (GPT-4o); 47.8% on SWT-Bench Lite leaderboard (script mode) |
| Otter / Otter++ | ICML 2025 | TDD-Bench Verified, Python | 31.4% / 37.0% F→P (GPT-4o) |
| Google BRT Agent | arXiv preprint 2025 | 80 Google-internal bugs, 7 languages | 28% plausible BRTs vs 10% for LIBRO |
| Issue2Test | ICSE 2026 | SWT-Bench Lite, Python | 30.4% (GPT-4o-mini), 32.9% (Claude 3.5 Sonnet) |
| AssertFlip | ICSE 2026 | SWT-Bench Verified (433) / Lite, Python | 43.6% (189/433) Verified; 36% Lite (GPT-4o) |
| BLAST | ASE 2025 | 426-issue Python benchmark | 151/426 (35.4%) vs 23.5% SOTA |
| e-Otter++ | arXiv 2025 (cited as ICSE 2026 by later work) | TDD-Bench Verified / SWT Lite | 63.0% / 52.5% F→P (Claude 3.7 Sonnet) |
| Qureshi & Jiang | arXiv preprint 2025 | Defects4J, GHRB, Java | >60% drop under identifier mutation |
| ReProAgent | arXiv preprint 2026 | SWT-Bench Lite / Verified | 58.43% / 70.30% |

### 1.1 LIBRO
- **Title:** Large Language Models are Few-shot Testers: Exploring LLM-based General Bug Reproduction
- **Authors:** Sungmin Kang, Juyeon Yoon, Shin Yoo
- **Venue:** ICSE 2023 ([DOI 10.1109/ICSE48619.2023.00194](https://dl.acm.org/doi/10.1109/ICSE48619.2023.00194))
- **Link:** https://arxiv.org/abs/2209.11515
- **What they did:** The first general (not crash-only) LLM bug-report-to-test approach. Codex is prompted few-shot with the bug report. Post-processing then decides when LLM output is trustworthy and ranks the candidate tests. They also found that tests added because of issues amount to about 28% of a project's test-suite size.
- **Data:** Defects4J (Java), plus 31 bug reports filed after the training cutoff.
- **Result:**
  - Reproducing tests for 33% of cases (251/750); a reproducing test ranked first for 149 bugs.
  - 32% on the post-cutoff reports.
  - Otter reports LIBRO at 19.9% F→P with a single generation (that number is from Otter, not the LIBRO paper).
  - The SWT-Bench Python port: 14.1% S, 15.2% F→P on SWT-Bench Lite.
- **vs TESTFORGE:** Same core task (issue → failing test). LIBRO samples several tests and ranks them; TESTFORGE does one shot, targets Python/pytest, and adds the human-test comparison.

### 1.2 Plein et al.
- **Title:** Automatic Generation of Test Cases based on Bug Reports: a Feasibility Study with Large Language Models
- **Authors:** Laura Plein, Wendkûuni C. Ouédraogo, Jacques Klein, Tegawendé F. Bissyandé
- **Venue:** ICSE 2024 Companion, Posters track ([CSDL](https://www.computer.org/csdl/proceedings-article/icse-companion/2024/050200a360/1XVHFm5Atyw))
- **Link:** https://arxiv.org/abs/2310.06320
- **What they did:** Prompted ChatGPT, and fine-tuned CodeGPT, to write tests from Defects4J bug reports. Each test is scored as:
  - *executable*;
  - *valid* (fails on the buggy version);
  - *relevant* (fails on buggy and passes on fixed, i.e. F→P).
- **Data:** Defects4J, Java (342 bugs in the ChatGPT table).
- **Result:**
  - ChatGPT, single generation: 15% executable, 7% valid, 6% relevant. 38% of the executable tests were relevant.
  - With 5 generations: 50% executable, 9% relevant.
  - 90% of the bug reports that led to relevant tests contained code.
- **vs TESTFORGE:** This is the closest early analogue of TESTFORGE's single-shot design, and it uses the same fails-before / passes-after check. It is Java only and does not compare against human tests.

### 1.3 SWT-Bench ⚠️ most important overlap
- **Title:** SWT-Bench: Testing and Validating Real-World Bug-Fixes with Code Agents
- **Authors:** Niels Mündler, Mark Niklas Müller, Jingxuan He, Martin Vechev
- **Venue:** NeurIPS 2024 ([proceedings](https://proceedings.neurips.cc/paper_files/paper/2024/hash/94f093b41fc2666376fb1f667fe282f3-Abstract-Conference.html))
- **Link:** https://arxiv.org/abs/2406.12952
- **What they did:** Turned SWE-bench into a test-generation benchmark: given the issue and the pre-fix repo, write tests that reproduce the issue.
  - They **formally define F→P, F→F, P→P and P→F per test** (Sec. 3.1).
  - An instance counts as solved if there is ≥1 F→P test and no test that fails after the fix.
  - They add a *change coverage* metric (ΔC) and compare code agents (SWE-Agent, AutoCodeRover, Aider) with LIBRO and zero-shot prompting.
- **Data:** 1,983 instances from 12 Python repos. 311 of the 2,294 SWE-bench instances were excluded because the golden patch could not be evaluated reliably. SWT-Bench Lite has 276 instances. SWT-Bench Verified (433 instances) was added 2025-02-28 ([leaderboard](https://swtbench.com/)).
- **Results (SWT-Bench Lite, GPT-4):**
  - Success rate S: ZeroShot 3.6%, ZeroShotPlus 9.4%, LIBRO 14.1%, SWE-Agent 15.9%, SWE-Agent+ 18.5%. SWE-Agent+ reaches F→P 19.2%.
  - **Golden (human) tests vs generated tests:**
    - Change coverage: golden ΔC = 72.0%; SWE-Agent+ 27.6% overall and 69.4% on solved instances.
    - Region counts: the golden row has F→P 100% (by construction) and a P→P test in 11.2% of instances. Over the full benchmark, golden test patches add 2.9 tests on average, "roughly two-thirds" of them F→P.
  - **Complementarity:** the best method alone solves 51 instances; the union of four methods solves 87.
  - **Filtering patches:** using generated tests to filter SWE-Agent patches gives 47.8% precision at 20% recall, more than doubling SWE-Agent's precision.
  - **Retrieval ablation (Table 5):** giving the model the test files to change raises S from 8.1% to 15.1%. Giving it the golden patch plus the files that patch changes raises S only to 10.5%.
- **vs TESTFORGE:** Same task, same four regions, and it runs golden tests in the same harness. Differences:
  - SWT-Bench filters out instances whose golden tests are not F→P, so human tests are F→P by construction there. TESTFORGE observes human tests *unfiltered*.
  - SWT-Bench verdicts are per test function and use 12 fixed dockerized repos. TESTFORGE verdicts are per file and it accepts any dependency-free repo.

### 1.4 TDD-Bench Verified / Auto-TDD
- **Title:** TDD-Bench Verified: Can LLMs Generate Tests for Issues Before They Get Resolved?
- **Authors:** Toufique Ahmed, Martin Hirzel, Rangeet Pan, Avraham Shinnar, Saurabh Sinha (IBM)
- **Venue:** arXiv preprint, 2024. The benchmark is also presented in the Otter ICML 2025 paper.
- **Link:** https://arxiv.org/abs/2412.02883
- **What they did:** Built a benchmark of 449 SWE-bench-derived issues, filtered by human judges and by execution. The harness runs only the relevant tests in isolation and scores a test by F→P plus *adequacy* (coverage of the changed lines). They also propose Auto-TDD, which takes the issue and the pre-fix codebase and returns a test.
- **Data:** Python, 12 repos.
- **Results:**
  - Auto-TDD with GPT-4o: 23.6% F→P on TDD-Bench Verified; 21.7% on SWT-Bench Lite.
  - **RQ4, human tests:**
    - Golden tests reach a tddScore of 0.94 ("even human-written tests are not perfect").
    - Model-generated F→P tests reach 0.91–0.95 coverage, "very close" to developer tests. A Wilcoxon test did not reject equality at 99%.
    - Non-F→P model tests have coverage below 0.6.
    - 35% of non-F→P tests had perfect coverage, so coverage ≠ correctness.
  - **Complementarity:** the union of three models reaches 135/449 (30%).
- **vs TESTFORGE:** This is the closest existing LLM-vs-human comparison, but it measures *coverage* only, and only on instances where the human tests are F→P. TESTFORGE compares *regions* and puts the human tests through the same verdict.

### 1.5 Otter / Otter++
- **Title:** Otter: Generating Tests from Issues to Validate SWE Patches
- **Authors:** Toufique Ahmed, Jatin Ganhotra, Rangeet Pan, Avraham Shinnar, Saurabh Sinha, Martin Hirzel (IBM)
- **Venue:** ICML 2025 ([PMLR v267](https://proceedings.mlr.press/v267/ahmed25b.html))
- **Link:** https://arxiv.org/abs/2502.05368
- **What they did:** An LLM pipeline with localization, a self-reflective action planner, and rule-based checking and repair of generated tests. Otter++ is an ensemble of 5 heterogeneous prompts. Generated tests are also used to select SWE-agent patches.
- **Data:** TDD-Bench Verified, Python.
- **Results:**
  - **F→P rate:** Otter 31.4%; Otter++ 37.0%; under $0.10 per issue with GPT-4o.
  - **Coverage vs golden tests (Table 5):** F→P tests 93.7 vs 95.6 (GPT-4o); non-F→P tests 60.0 vs 93.3.
  - **Breakdown by pre-fix outcome (Table 6, GPT-4o):**
    - Tests that *passed* on the old code: 69, F→P rate 0%.
    - Tests that failed on an *assertion*: F→P rate 57.1%.
    - Tests that failed with an *error*: F→P rate 3.7% (4/109).
  - **By test type:** patching an existing test file gives 41.0% vs 27.8% for adding a new one.
- **vs TESTFORGE:** Same task with an agentic pipeline. The Table 6 breakdown directly informs TESTFORGE's open-issue mode: "fails on current code" is weak evidence unless the failure is an assertion failure.

### 1.6 e-Otter++ (2025 state of the art from IBM)
- **Title:** Heterogeneous Prompting and Execution Feedback for SWE Issue Test Generation and Selection
- **Authors:** Toufique Ahmed, Jatin Ganhotra, Avraham Shinnar, Martin Hirzel
- **Venue:** arXiv 2025. [Investigating Test Overfitting on SWE-bench](https://arxiv.org/abs/2511.16858) cites it as ICSE 2026; the ICSE program was not checked **[venue unverified]**.
- **Link:** https://arxiv.org/abs/2508.06365
- **What they did:** Adds execution feedback and heterogeneous prompting to Otter.
- **Result:** 63.0% F→P on TDD-Bench Verified and 52.5% on SWT-Bench Lite (Claude 3.7 Sonnet). The best prior baselines they report are 38.8% and 37.7%.
- **vs TESTFORGE:** Shows how much an iterative, execution-feedback loop adds over single-shot prompting.

### 1.7 Issue2Test
- **Title:** Issue2Test: Generating Reproducing Test Cases from Issue Reports
- **Authors:** Noor Nashid, Islem Bouzenia, Michael Pradel, Ali Mesbah
- **Venue:** ICSE 2026 Research Track ([program](https://conf.researchr.org/details/icse-2026/icse-2026-research-track/87/Issue2Test-Generating-Reproducing-Test-Cases-from-Issue-Reports))
- **Link:** https://arxiv.org/abs/2503.16320
- **What they did:** Gathers context, generates a test, then iteratively refines it on compilation and runtime feedback until it fails *for the reason described in the issue*.
- **Data:** SWT-Bench Lite (276), Python.
- **Results:**
  - F→P: 30.4% (84/276) with GPT-4o-mini at $0.0521 per issue; 32.9% (91/276) with Claude 3.5 Sonnet at $0.66 per issue.
  - Reproduces 20 issues that four prior tools miss.
- **vs TESTFORGE:** Its "fails for the right reason" check targets exactly the weakness in TESTFORGE's open-issue mode, where any failure on current code counts.

### 1.8 AssertFlip
- **Title:** AssertFlip: Reproducing Bugs via Inversion of LLM-Generated Passing Tests
- **Authors:** Lara Khatib, Noble Saji Mathews, Meiyappan Nagappan
- **Venue:** ICSE 2026 Research Track ([program](https://conf.researchr.org/details/icse-2026/icse-2026-research-track/85/AssertFlip-Reproducing-Bugs-via-Inversion-of-LLM-Generated-Passing-Tests))
- **Link:** https://arxiv.org/abs/2507.17542
- **What they did:** Has the LLM write a test that *passes* on the buggy behaviour, then inverts its assertions so the test fails while the bug is present.
- **Data:** SWT-Bench Verified (433) and Lite, Python. Model: GPT-4o.
- **Results:**
  - 43.6% F→P on Verified (189/433); 36% on Lite.
  - Lite issues that are also in Verified: 45.5%. Lite-only (vaguer) issues: 31.4%.
  - Amazon Q is reported at 49.0% on Verified.
- **vs TESTFORGE:** A cheap prompt-level trick that could plug straight into TESTFORGE's single-shot pipeline.

### 1.9 AEGIS
- **Title:** AEGIS: An Agent-based Framework for General Bug Reproduction from Issue Descriptions
- **Authors:** Xinchen Wang, Pengfei Gao, …, Cuiyun Gao (ByteDance et al.)
- **Venue:** FSE 2025 Industry Papers ([DOI 10.1145/3696630.3728557](https://dl.acm.org/doi/10.1145/3696630.3728557))
- **Link:** https://arxiv.org/abs/2411.18015
- **What they did:** An agent with concise context construction and a finite-state-machine-controlled multi-feedback loop. It generates bug *reproduction scripts*.
- **Data:** SWE-bench Lite (300), Python.
- **Results:**
  - 36.0% F→P with GPT-4o vs 13.0% for their AgentBaseline (abstract: +23.0% over SOTA).
  - Improves Agentless's resolved rate by 12.5% (relative).
  - Leaderboard: 47.8% on SWT-Bench Lite, but marked ‡ "stand-alone reproduction scripts", not integrated into the test framework.
- **vs TESTFORGE:** Scripts rather than pytest files, and an agent rather than a single shot.

### 1.10 Google BRT Agent
- **Title:** Agentic Bug Reproduction for Effective Automated Program Repair at Google
- **Authors:** Runxiang Cheng, Michele Tufano, Jürgen Cito, José Cambronero, Pat Rondon, Renyao Wei, Aaron Sun, Satish Chandra
- **Venue:** arXiv preprint, 2025 (no venue found)
- **Link:** https://arxiv.org/abs/2502.01821
- **What they did:** Adapted LIBRO to Google's internal setting and built BRT Agent, using a fine-tuned code-editing LLM. Generated bug reproduction tests (BRTs) feed into Google's APR system. They also introduce Ensemble Pass Rate (EPR) for selecting fixes.
- **Data:** 80 bugs from Google's internal tracker, spanning Java, C++, Go, Python, Kotlin, Dart and TypeScript.
- **Results:**
  - 28% plausible BRTs vs 10% for LIBRO.
  - **67% of plausible BRTs are semantically equivalent or identical to the developer's ground-truth BRT** (manual inspection).
  - BRTs give 30% more bugs with plausible fixes.
  - EPR top-1 selects a plausible fix 70% of the time.
- **vs TESTFORGE:** The 67% equivalence figure is a coarse LLM-vs-human overlap measure. TESTFORGE could compute an execution-based version.

### 1.11 Qureshi & Jiang
- **Title:** Test Case Generation from Bug Reports via Large Language Models: A Cognitive Layered Evaluation Framework
- **Authors:** Irtaza Sajid Qureshi, Zhen Ming (Jack) Jiang
- **Venue:** arXiv preprint, 2025
- **Link:** https://arxiv.org/abs/2510.05365
- **What they did:** Re-evaluated LIBRO-style generation with StarCoder and GPT-4o, organized by Bloom's taxonomy layers (remember / understand / apply / analyze …). They use rephrased, translated and identifier-mutated bug reports.
- **Data:** Defects4J, GHRB and mutated variants (Java).
- **Results:**
  - Performance drops by more than 60% under identifier mutations.
  - Near-identical few-shot examples improve success by up to 3×.
  - Structured elements (test code, method names) matter more than narrative text.
- **vs TESTFORGE:** A robustness and memorization angle. It is relevant because TESTFORGE's default targets (e.g. more-itertools) are popular and probably in LLM training data.

### 1.12 Other relevant 2025–2026 work
- **BLAST** (Kitsios, Castelluccio, Bacchelli; ASE 2025)
  - **Link:** https://arxiv.org/abs/2509.01616
  - **Approach:** LLM plus search-based software testing (SBST), working from issue-patch pairs.
  - **Result:** 151/426 (35.4%) vs 23.5% for the prior state of the art.
  - **Deployment:** ran as a GitHub bot in 3 repos for 3 months; generated a reproducing test for 11 of 32 PR-issue pairs.
  - **vs TESTFORGE:** Uses the *patch* as input. TESTFORGE's LLM sees only the pre-fix files.
- **ReProAgent** (Zhang et al.; arXiv preprint 2026)
  - **Link:** https://arxiv.org/abs/2607.09123
  - **Approach:** A four-stage agent (localization, root cause, plan, generate).
  - **Result:** 58.43% on SWT-Bench Lite and 70.30% on Verified, at $0.14 per instance.
- **SWT-Bench leaderboard** (https://swtbench.com, read 2026-10-10)
  - The page lists DevstralTestGen at 89.1% (Lite, script mode) and ReProAgent GPT-5-mini at 56.2% (Lite).
  - News entries: LogicStar at 84% on SWT-Verified (2025-09-13); Salesforce TEX-T at 87% (Verified, script mode, 2025-12-17); e-Otter++ at 50.7% Lite / 60.7% Verified (2025-08-11).
  - The leaderboard notes that a 2025-09-13 grading fix raised earlier scores by 2–3%. Several top entries have no paper, so treat them as **[unverified methodology]**.

---

## 2. Quality of the human-written ("golden") tests in issue benchmarks

This is the most relevant section if the student studies whether maintainer tests are weak or redundant.

| Work | Venue | Finding about human tests (exact) |
|---|---|---|
| SWE-bench Verified (OpenAI 2024) | Blog | 61.1% of 1,699 annotated samples flagged for tests that may reject valid solutions |
| SWE-bench+ | arXiv 2024 | 31.08% of passed patches are suspicious because of weak tests; SWE-Agent+GPT-4 drops from 12.47% to 3.97% |
| PatchDiff | ICSE 2026 | Running only PR-modified test files lets 7.8% incorrect patches through; 29.6% of plausible patches diverge from gold |
| UTBoost | ACL 2025 | 36 instances with insufficient tests; 345 wrongly-passed patches |
| SWE-ABS | arXiv 2026 | Strengthens 50.2% of Verified; rejects 19.71% of passing patches; top score drops from 78.80% to 62.20% |
| Probe to Generate | arXiv 2026 | 77% of Verified instances admit a surviving wrong variant |
| OpenAI audit (Feb 2026) | Blog | 59.4% of 138 audited tasks flawed (35.5% narrow tests, 18.8% wide tests) |
| Test overfitting | FSE Companion 2026 | Generated-test-driven refinement increases overfitting to the hidden golden tests |
| Beyond Fail-to-Pass | arXiv 2026 | Many F→P tests are "lax"; only rigorous ones improve repair |

### 2.1 SWE-bench+
- **Title:** SWE-Bench+: Enhanced Coding Benchmark for LLMs
- **Authors:** Reem Aleithan, Haoran Xue, Mohammad Mahdi Mohajer, Elijah Nnorom, Gias Uddin, Song Wang (York University)
- **Venue:** arXiv 2024. A revised version, "SWE-Bench+: Enhanced LLM Coding Benchmark", appears in the AIware '26 ACM proceedings ([DL](https://dl.acm.org/doi/10.1145/3805760.3814924)); that version was not read.
- **Link:** https://arxiv.org/abs/2410.06992
- **What they did:** Manually screened the 251 patches that SWE-Agent+GPT-4 "resolved" and compared each against the gold PR.
- **Results:**
  - 32.67% are solution leakage.
  - **31.08% are suspicious because of weak tests:** incorrect fixes 12.75%, different files or functions changed 3.59%, incomplete fixes 14.74%.
  - Filtering these out drops the resolution rate from 12.47% to 3.97%.
  - They also build a post-cutoff dataset.
- **vs TESTFORGE:** Shows human tests often accept wrong fixes. TESTFORGE's "redundant" and "fails at both" regions for *human* tests are a cheap automatic proxy for this.

### 2.2 PatchDiff
- **Title:** Are "Solved Issues" in SWE-bench Really Solved Correctly? An Empirical Study
- **Authors:** You Wang, Michael Pradel, Zhongxin Liu
- **Venue:** ICSE 2026 ([DL](https://dl.acm.org/doi/abs/10.1145/3744916.3764576))
- **Link:** https://arxiv.org/abs/2503.15223
- **What they did:** Re-validated plausible patches from three tools (CodeStory, LearnByInteract, OpenHands) on SWE-bench Verified in two ways:
  - running *all* developer tests, not just the PR-modified test files;
  - PatchDiff, a differential-testing technique that finds behavioural differences between a generated patch and the gold patch.
- **Results:**
  - 7.8% of plausible patches fail the full developer suite (4.5 pp drop in resolution rate).
  - 29.6% of plausible patches behave differently from the gold patch: 46.8% of those are similar but divergent implementations; 27.3% change more behaviour than gold.
  - 28.6% of the divergent patches are certainly incorrect.
  - Resolution rates are inflated by 6.2 pp overall.
- **vs TESTFORGE:** TESTFORGE also runs only the PR's test files, which is the very weakness PatchDiff quantifies. Worth acknowledging.

### 2.3 UTBoost
- **Title:** UTBoost: Rigorous Evaluation of Coding Agents on SWE-Bench
- **Authors:** Boxi Yu, Yuxuan Zhu, Pinjia He, Daniel Kang
- **Venue:** ACL 2025 (Long)
- **Link:** https://aclanthology.org/2025.acl-long.189/ (arXiv [2506.09289](https://arxiv.org/abs/2506.09289))
- **What they did:** Built UTGenerator, an LLM test generator that analyses the codebase and dependencies, to augment SWE-bench's human tests.
- **Results:**
  - Found 36 task instances with insufficient tests and 345 erroneous patches marked as passed.
  - The corrections affect 40.9% of SWE-bench Lite and 24.4% of SWE-bench Verified leaderboard entries, causing 18 and 11 ranking changes respectively.
- **vs TESTFORGE:** Direct evidence that LLM tests can catch what human tests miss. Their generator, however, aims to separate gold from agent patches rather than working from the issue alone.

### 2.4 SWE-ABS
- **Title:** SWE-ABS: Adversarial Benchmark Strengthening Exposes Inflated Success Rates on Test-based Benchmark
- **Authors:** Boxi Yu et al. (incl. Pinjia He, Lionel Briand)
- **Venue:** arXiv preprint, 2026
- **Link:** https://arxiv.org/abs/2603.00520
- **What they did:** Strengthens tests with coverage-driven augmentation (using program slicing) plus mutation-driven adversarial patches.
- **Results:**
  - On SWE-bench Verified (500): strengthens 50.2% of instances, 25.1× more than prior work.
  - Rejects 19.71% of previously passing patches.
  - The top agent drops from 78.80% to 62.20%.
  - About 1 in 5 "solved" patches from the top 30 agents are semantically incorrect.

### 2.5 Probe to Generate
- **Title:** Probe to Generate: Program Variant-Guided Test Augmentation for Repository-Level Repair Benchmarks
- **Authors:** Chenglin Li, Yisen Xu, Zehao Wang, Shin Hwei Tan, Tse-Hsun (Peter) Chen
- **Venue:** arXiv preprint, 2026
- **Link:** https://arxiv.org/abs/2604.01518
- **What they did:** Creates semantic variants of the reference patch. Any variant that survives the original tests exposes a gap, and new tests are generated to close it.
- **Results:**
  - **77% of SWE-bench Verified instances admit at least one surviving variant.**
  - 1,014 validated tests across 211 instances.
  - Patch-region coverage up 10.8 pp (line) and 9.5 pp (branch).
  - Top-10 agents' resolved rates drop by 4.2–9.0%.
- **vs TESTFORGE:** Mutation-style evidence of weak human tests. TESTFORGE could adopt the "surviving variant" idea to grade both suites.

### 2.6 OpenAI: SWE-bench Verified creation (2024) and retirement (2026)
- **Introducing SWE-bench Verified** (OpenAI, 2024-08-13): https://openai.com/index/introducing-swe-bench-verified/
  - 93 Python developers annotated 1,699 SWE-bench samples, 3 annotators each.
  - **61.1% were flagged for unit tests that may unfairly reject valid solutions**; 38.3% for underspecified problem statements; 68.3% were filtered out overall.
  - The result is 500 samples; GPT-4o resolves 33.2% with the best scaffold.
  - Their example is scikit-learn-14520, where the test demands an exact DeprecationWarning message that was never mentioned in the issue.
- **Why we no longer evaluate SWE-bench Verified** (OpenAI, 2026-02-23): https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/
  - Audited 138 Verified problems that o3 did not consistently solve over 64 runs. **59.4% have material test or description issues:**
    - 35.5% *narrow* tests that enforce implementation details; e.g. pylint-4551 tests import a new function `get_annotation` that is never mentioned in the issue.
    - 18.8% *wide* tests that check functionality not in the issue; e.g. sympy-18199, where the PR fixed 3 issues but the task describes 1.
    - 5.1% miscellaneous.
  - Also reports contamination. OpenAI stopped reporting Verified and recommends SWE-bench Pro.
- **vs TESTFORGE:** "Narrow" human tests (e.g. ones that import a symbol added by the fix) will land in TESTFORGE's F→P region *trivially*, through an ImportError on the pre-fix commit. That inflates "caught the bug" for human tests (see §5).

### 2.7 Investigating Test Overfitting on SWE-bench
- **Authors:** Toufique Ahmed, Jatin Ganhotra, Avraham Shinnar, Martin Hirzel
- **Venue:** FSE Companion 2026 ([DL](https://dl.acm.org/doi/10.1145/3803437.3805574))
- **Link:** https://arxiv.org/abs/2511.16858
- **What they did:** Studied whether code refined against *generated* issue tests overfits and then fails the hidden golden tests.
- **Result:** "test overfitting is still a problem"; refinement against tests resolves some extra issues but increases overfitting. The text read gave no single headline percentage **[numbers not extracted]**.

### 2.8 Beyond Fail-to-Pass
- **Title:** Beyond Fail-to-Pass: Iterative Hardening of Co-Generated Bug Reproduction Tests and Fixes
- **Authors:** Yuhao Tan, Zhibang Yang, … , Dongmei Zhang (12 authors)
- **Venue:** arXiv preprint, 2026
- **Link:** https://arxiv.org/abs/2607.19843
- **What they did:** Split F→P BRTs into *rigorous* and *lax*. A lax test reproduces the symptom but still admits plausible but incorrect (mutation) patches.
- **Results:**
  - Lax tests are common. For LogicStar's BRTs, 196 are rigorous and 181 lax; for e-Otter++, 156 rigorous and 116 lax.
  - Only rigorous tests consistently improve repair. For example, LogicStar's rigorous BRTs give +13.8 pp resolved, while lax ones give +0.2 pp.
  - Their method, CoHarden, reaches 69.4% resolved and 78.9% F→P on SWE-bench Verified.
- **vs TESTFORGE:** TESTFORGE's "caught the bug" (F→P) region does not separate rigorous from lax tests. This paper is the citation for that limitation.

---

## 3. LLM-generated tests vs developer-written tests

| Work | Setting | Comparison result |
|---|---|---|
| SWT-Bench (§1.3) | Issue → test, Python | Change coverage: golden 72.0% vs best agent 27.6% (69.4% on solved instances) |
| TDD-Bench Verified (§1.4) | Issue → test | LLM F→P tests 0.91–0.95 coverage ≈ developer tests (not significant); non-F→P < 0.6 |
| Otter (§1.5) | Issue → test | F→P: 93.7 vs 95.6 coverage; non-F→P: 60.0 vs 93.3 |
| Google BRT (§1.10) | Internal bugs | 67% of plausible LLM BRTs semantically equivalent or identical to the developer BRT |
| UTBoost / SWE-ABS / Probe to Generate (§2) | Augmenting golden tests | LLM-generated tests expose wrong patches that human tests accept |
| LLM vs Human Unit Tests (below) | BugsInPy, Python | 69.0% vs 17.2% fault detection; coverage about equal |
| TestPilot (below) | npm, JS | 92.8% of generated tests are ≤50% similar to existing tests |
| Incorrect code (below) | Various | Showing buggy code hurts test generation |

### 3.1 LLM vs. Human Unit Tests
- **Title:** LLM vs. Human Unit Tests: Fault Detection on Real Python Bugs
- **Authors:** Phouvadeth Vathana, Prapti Bhatt, Rishi Patel, Nasir U. Eisty
- **Venue:** arXiv preprint, 2026
- **Link:** https://arxiv.org/abs/2606.08588
- **What they did:** Compared Gemini 2.5 Flash tests, generated with lexical retrieval of bug context, against human tests.
- **Data:** 29 BugsInPy bugs plus function-level and paired benchmarks (52 tasks in total).
- **Results:**
  - **LLM tests detect 20/29 faults (69.0%); human tests detect 5/29 (17.2%).** Fisher's exact p < 0.001, Cohen's h = 1.10.
  - Coverage is about the same (human vs LLM): line 84.8% vs 88.5%, branch 75.2% vs 82.1%, not significant.
- **Caveats (the authors' own):**
  - The LLM saw the **patch diff and bug description**.
  - The human tests are **pre-existing, general-purpose tests**, not the fix-PR tests.
- **vs TESTFORGE:** This is the nearest "LLM vs human" fault-detection study in Python, but the comparison is different. TESTFORGE pits *issue-only* LLM tests against *the maintainer's fix-PR tests* on the same bug, which is a fairer and harder comparison.

### 3.2 TestPilot
- **Title:** An Empirical Evaluation of Using Large Language Models for Automated Unit Test Generation
- **Authors:** Max Schäfer, Sarah Nadi, Aryaz Eghbali, Frank Tip
- **Venue:** IEEE TSE 2024 **[venue unverified, not checked]**
- **Link:** https://arxiv.org/abs/2302.06527
- **Results (25 npm packages, JS):**
  - Median 70.2% statement and 52.8% branch coverage.
  - 92.8% of generated tests have ≤50% similarity to existing tests, and none are exact copies.

### 3.3 Measuring the Influence of Incorrect Code on Test Generation
- **Authors:** Dong Huang, Jie M. Zhang, Mark Harman, Mingzhe Du, Heming Cui
- **Venue:** arXiv preprint, 2024 **[venue unverified]**
- **Link:** https://arxiv.org/abs/2409.09464
- **Results:**
  - With correct rather than incorrect code under test, LLM tests gain +57% accuracy, +12% coverage and +24% bug detection.
  - On real-world code, tests generated against incorrect code have 47% worse bug detection.
- **vs TESTFORGE:** TESTFORGE deliberately shows the LLM the *pre-fix (buggy)* files, so this effect works against it. That is a design point worth stating.

### 3.4 TestGenEval
- **Authors:** Kush Jain, Gabriel Synnaeve, Baptiste Rozière
- **Venue:** arXiv 2024 (ICLR 2025 **[unverified]**)
- **Link:** https://arxiv.org/abs/2410.00752
- **What they did:** A test-generation benchmark built from SWE-bench repos: 68,647 tests from 1,210 code/test file pairs across 11 Python repos.
- **Result:** The best model (GPT-4o) reaches only 35.2% average coverage. This is not issue-driven.

---

## 4. Foundations

### 4.1 SWE-bench
- **Title:** SWE-bench: Can Language Models Resolve Real-World GitHub Issues?
- **Authors:** Carlos E. Jimenez, John Yang, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik Narasimhan
- **Venue:** ICLR 2024 ([proceedings](https://proceedings.iclr.cc/paper_files/paper/2024/hash/edac78c3e300629acfe6cbe9ca88fb84-Abstract-Conference.html))
- **Link:** https://arxiv.org/abs/2310.06770
- **What they did:** 2,294 problems from real GitHub issues and their PRs across 12 Python repos. A patch counts as correct if the PR's FAIL_TO_PASS and PASS_TO_PASS tests pass. The best model at the time, Claude 2, solved 1.96%.
- **vs TESTFORGE:** TESTFORGE's pipeline (closed issue → merged PR → pre/post-fix trees → run the PR's tests) is the same mining recipe. TESTFORGE turns it around to evaluate *tests* instead of *patches*, like SWT-Bench.

### 4.2 SWE-bench Verified
- **Source:** OpenAI with the SWE-bench authors, 2024. https://openai.com/index/introducing-swe-bench-verified/ (dataset: https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified)
- **Contents:** 500 human-validated samples; full numbers in §2.6. SWT-Bench Verified (433) mirrors it.

---

## 5. Gaps TESTFORGE could still fill (honest assessment)

**Already covered, so do not claim these as novel:**
- **The four-region classification of a test's pre/post-fix outcome.** SWT-Bench defines F→P, F→F, P→P and P→F per test and applies it to both generated and golden tests. TDD-Bench and Otter score tests the same way.
- **"LLM tests reach coverage similar to human tests."** TDD-Bench Verified and Otter already show this for F→P tests.
- **"LLM tests can catch what human tests miss."** UTBoost, SWE-ABS and Probe to Generate show it on SWE-bench, but their generators see the gold patch or code. LLM vs Human Unit Tests shows it on BugsInPy, but against pre-existing general tests.
- **Complementarity across LLM methods or models.** Covered by SWT-Bench (51 → 87), TDD-Bench (union 135/449) and Issue2Test (20 unique issues).

**Plausible gaps.** None of these appear in the papers read. That is absence in this search, not a proof of absence.

1. **Running the issue-only LLM suite and the maintainer's fix-PR suite through the same four regions on the same issue, without filtering.**
   - Every benchmark (SWE-bench, SWT-Bench, TDD-Bench) *keeps only* instances where the golden tests are F→P. SWT-Bench says explicitly that because of this filtering "no golden tests are F→F or P→F".
   - Human tests landing in P→P (redundant), F→F or P→F are therefore invisible in prior work.
   - TESTFORGE, run on arbitrary closed issues, can measure how often maintainer tests *do not* catch the bug they ship with. That is its most defensible contribution.
2. **The LLM-region × human-region cross-table per issue.** This would quantify complementarity *between LLM and human* tests, e.g. "LLM catches the bug, human test is redundant" vs the reverse. Prior work only compares coverage, and only on F→P instances.
3. **The Jorgensen specified/programmed/tested Venn framing.** No paper in this area was found using it. It is a conceptual contribution (an interpretive lens), not a technical one.
4. **Open-issue mode as TDD in the wild.** TDD-Bench, Otter and e-Otter++ simulate TDD on *closed* issues. Running on *open* issues has no ground truth, but nobody reports field data for it. Keep it honest:
   - Otter's Table 6 shows pre-fix failures with errors are F→P only 3.7% of the time, versus 57.1% for assertion failures.
   - So TESTFORGE should report the failure *type* (AssertionError vs ImportError and the like), or adopt Issue2Test's "fails for the right reason" check.

**Known limitations, each with a citation:**
- **File-level verdicts.** SWT-Bench and every later paper decide per test function. TESTFORGE's per-file verdict is coarser and can hide mixed outcomes. Switching to per-test parsing (e.g. pytest's `-rA` or JUnit XML output) would remove this weakness.
- **F→P does not mean "caught the bug".**
  - Lax tests exist (Beyond Fail-to-Pass).
  - Narrow human tests that import new symbols become F→P through ImportError (OpenAI 2026, the pylint-4551 example).
  - TESTFORGE could split F→P into assertion-F→P and error-F→P cheaply.
- **Only the PR's test files are run.** PatchDiff shows this misses 7.8% of incorrect patches. Running the full suite would also measure P→F regressions properly.
- **Prompt context = files touched by the fix.** This leaks localization from the gold patch. In SWT-Bench's ablation, giving the files that the patch changes moved S from 8.1% to 10.5%, and giving the test files to change moved it to 15.1%. Disclose this as an oracle-localization assumption.
- **Single-shot prompting.** SWT-Bench's single-shot baselines get 3.6–9.4% S (GPT-4). Agentic or feedback systems get 30–63% F→P (Issue2Test, AssertFlip, Otter++, e-Otter++). Expect low absolute LLM F→P rates. AssertFlip's pass-then-invert trick is a cheap single-prompt upgrade.
- **Buggy code in the prompt.** Huang et al. measure 47% worse real-world bug detection when tests are generated against incorrect code.
- **Contamination.** OpenAI 2026 shows frontier models reproduce gold patches verbatim. Qureshi & Jiang show performance drops above 60% under identifier mutation. Popular dependency-free repos like more-itertools are likely to be memorized.
- **Fix-PR heuristic** (first merged PR that references the issue). SWE-bench uses a similar issue-to-PR link. OpenAI's sympy-18199 example shows one PR can cover several issues, which produces "wide" tests.
