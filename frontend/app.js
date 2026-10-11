/* ===================================================================
   TESTFORGE frontend controller
   - loads provider presets
   - POSTs config to /api/generate and reads the NDJSON event stream
   - drives the status log, ASCII progress bar, live model stream, results
   - QOL: form persisted to localStorage, elapsed timer, scroll pinning,
     viewport-aware tooltips, collapsible result files
   =================================================================== */

const $ = (id) => document.getElementById(id);
const BAR_WIDTH = 40;

let PRESETS = [];
let abortController = null;
let verdictSummary = ""; // issue mode: shown in the stage line when the run completes

/* ------------------- mobile tabs + config collapse ---------------- */
const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
let userPickedTab = false; // manual tab choice wins over auto-switching

function setTab(name) {
  document.querySelector(".io").dataset.tab = name;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
}

// follow the run (log -> stream -> files) unless the user picked a tab
function autoTab(name) {
  if (isMobile() && !userPickedTab) setTab(name);
}

function setCfgCollapsed(on) {
  document.querySelector(".controls").classList.toggle("collapsed", on);
  $("cfg_toggle").textContent = on ? "[ show ]" : "[ hide ]";
}

/* -------------------------- persistence --------------------------- */
const PERSIST = [
  "repo_url", "ref", "issue", "provider", "model", "model_custom", "base_url",
  "max_files", "max_kb", "framework_hint", "include_globs",
  "skip_tests", "write_output", "verify",
];
const savedState = (() => {
  try { return JSON.parse(localStorage.getItem("testforge")) || {}; }
  catch { return {}; }
})();

function saveState() {
  const s = {};
  for (const id of PERSIST) {
    const el = $(id);
    s[id] = el.type === "checkbox" ? el.checked : el.value;
  }
  localStorage.setItem("testforge", JSON.stringify(s));
}

function restoreField(id) {
  if (!(id in savedState)) return;
  const el = $(id);
  if (el.type === "checkbox") el.checked = !!savedState[id];
  else el.value = savedState[id];
}

/* --------------------------- bootstrap ---------------------------- */
async function loadProviders() {
  try {
    const res = await fetch("/api/providers");
    PRESETS = await res.json();
  } catch (e) {
    log("err", "INIT", "Failed to load providers: " + e.message);
    return;
  }
  const sel = $("provider");
  sel.innerHTML = "";
  for (const p of PRESETS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label + (p.key_present ? "  [key ok]" : "");
    sel.appendChild(opt);
  }
  // last-used provider wins; otherwise default to deepseek if present
  if (savedState.provider && PRESETS.some((p) => p.id === savedState.provider)) {
    sel.value = savedState.provider;
  } else if (PRESETS.some((p) => p.id === "deepseek")) {
    sel.value = "deepseek";
  }
  onProviderChange();
}

function currentPreset() {
  return PRESETS.find((p) => p.id === $("provider").value) || {};
}

function fillModels(models) {
  // Custom scaffold can't be enumerated -> free-text input; everyone else gets
  // a real <select> (a dropdown that actually opens on click). First = newest.
  const custom = !!currentPreset().needs_base_url;
  const sel = $("model");
  sel.style.display = custom ? "none" : "";
  $("model_custom").style.display = custom ? "" : "none";
  sel.innerHTML = "";
  models.forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  });
  // restore last-used model if it's still offered
  if (savedState.model && models.includes(savedState.model)) {
    sel.value = savedState.model;
  }
}

function selectedModel() {
  return (
    currentPreset().needs_base_url ? $("model_custom").value : $("model").value
  ).trim();
}

async function onProviderChange() {
  const p = currentPreset();
  fillModels(p.models || []); // instant fallback from the preset
  $("base_url_field").style.display = p.needs_base_url ? "" : "none";

  // Pull the live model list (server queries the provider with the .env key),
  // newest first. Silently keep the preset list if it can't (no key / offline).
  try {
    const live = await fetch(
      "/api/models?provider=" + encodeURIComponent(p.id)
    ).then((r) => r.json());
    if (currentPreset().id === p.id && Array.isArray(live) && live.length) {
      fillModels(live);
    }
  } catch {}
}

/* ------------------------------ log ------------------------------- */
function nearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

function log(level, tag, msg) {
  const box = $("log");
  const stick = nearBottom(box);
  const row = document.createElement("div");
  row.className = "row " + level;
  const ts = new Date().toLocaleTimeString("en-GB");
  row.innerHTML =
    `<span class="ts">${ts}</span> ` +
    `<span class="tag">[${tag}]</span> ` +
    `<span class="${level}">${escapeHtml(msg)}</span>`;
  box.appendChild(row);
  if (stick) box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* --------------------------- progress ----------------------------- */
function setProgress(frac, stage, message) {
  frac = Math.max(0, Math.min(1, frac || 0));
  const filled = Math.round(frac * BAR_WIDTH);
  const bar = "[" + "#".repeat(filled) + "-".repeat(BAR_WIDTH - filled) + "]";
  $("progress_bar").textContent = bar;
  $("progress_pct").textContent = String(Math.round(frac * 100)).padStart(3, " ") + "%";
  if (stage) $("stage_tag").textContent = "[ " + stage.toUpperCase() + " ]";
  if (message !== undefined) $("stage_msg").textContent = message;
}

/* elapsed timer, shown while a run is live */
let timerId = null;
function startTimer() {
  const t0 = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    $("elapsed").textContent =
      Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " elapsed";
  };
  tick();
  timerId = setInterval(tick, 1000);
}
function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

/* --------------------------- streaming ---------------------------- */
function buildPayload() {
  const globs = $("include_globs").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    repo_url: $("repo_url").value.trim(),
    provider: $("provider").value,
    model: selectedModel(),
    base_url: $("base_url").value.trim() || null,
    ref: $("ref").value.trim() || null,
    issue: parseInt($("issue").value, 10) || null,
    include_globs: globs,
    skip_tests: $("skip_tests").checked,
    max_files: parseInt($("max_files").value, 10) || 10,
    max_bytes: (parseInt($("max_kb").value, 10) || 120) * 1024,
    framework_hint: $("framework_hint").value.trim() || null,
    write_output: $("write_output").checked,
    verify: $("verify").checked,
  };
}

async function run() {
  const payload = buildPayload();
  if (!payload.repo_url) {
    setCfgCollapsed(false); // make sure the offending field is visible
    log("warn", "INPUT", "Enter a GitHub repository first.");
    $("repo_url").classList.add("invalid");
    $("repo_url").focus();
    return;
  }
  saveState();

  // on small screens: tuck the form away (RUN/ABORT stay) and watch the log
  userPickedTab = false;
  if (isMobile()) {
    setCfgCollapsed(true);
    setTab("log");
  }
  $("files_tab").textContent = "FILES";

  // reset UI
  $("log").innerHTML = "";
  $("stream").textContent = "";
  $("reasoning").textContent = "";
  $("reasoning").style.display = "none";
  $("results").innerHTML = '<div class="empty">generating...</div>';
  $("token_count").textContent = "0 tok";
  $("result_meta").textContent = "";
  setProgress(0, "init", "starting...");
  verdictSummary = "";
  document.querySelector(".progress-panel").classList.add("active");

  setRunning(true);
  startTimer();
  abortController = new AbortController();

  let tokenCount = 0;
  let streamText = "";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error("HTTP " + res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;

        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }

        switch (ev.type) {
          case "stage":
            setProgress(ev.progress, ev.stage,
              ev.stage === "done" && verdictSummary ? verdictSummary : ev.message);
            break;
          case "log":
            log(ev.level || "info", (ev.stage || "log").toUpperCase(), ev.message);
            break;
          case "reasoning": {
            const r = $("reasoning");
            const stick = nearBottom(r);
            r.style.display = "";
            r.textContent += ev.text;
            if (stick) r.scrollTop = r.scrollHeight;
            break;
          }
          case "token": {
            const st = $("stream");
            const stick = nearBottom(st);
            streamText += ev.text;
            tokenCount += 1;
            if (tokenCount === 1) autoTab("stream");
            st.textContent = streamText;
            if (stick) st.scrollTop = st.scrollHeight;
            if (tokenCount % 8 === 0)
              $("token_count").textContent = tokenCount + " tok";
            break;
          }
          case "result":
            $("token_count").textContent = tokenCount + " tok";
            renderResults(ev);
            verdictSummary = Object.entries(ev.verdicts || {})
              .map(([k, v]) => `${k}: ${v.region}`).join("  ::  ");
            if (verdictSummary) verdictSummary = "Complete  ::  " + verdictSummary;
            break;
          case "error":
            log("err", "ERROR", ev.message);
            $("stage_tag").textContent = "[ ERROR ]";
            $("stage_msg").textContent = ev.message;
            $("results").innerHTML =
              '<div class="empty">generation failed — see status log.</div>';
            autoTab("log");
            break;
          case "done":
            break;
        }
      }
    }
  } catch (e) {
    if (e.name === "AbortError") {
      log("warn", "ABORT", "Generation aborted by user.");
      $("stage_tag").textContent = "[ ABORTED ]";
      $("stage_msg").textContent = "aborted by user";
    } else {
      log("err", "ERROR", e.message);
      $("stage_tag").textContent = "[ ERROR ]";
      $("stage_msg").textContent = e.message;
    }
  } finally {
    setRunning(false);
    stopTimer();
    document.querySelector(".progress-panel").classList.remove("active");
  }
}

function setRunning(on) {
  $("run_btn").disabled = on;
  $("stop_btn").disabled = !on;
}

/* ---------------------------- results ----------------------------- */
function renderResults(ev) {
  const tests = ev.tests || [];
  const human = ev.human_tests || [];
  const box = $("results");
  box.innerHTML = "";

  const meta = [];
  if (ev.stats) meta.push(`${ev.stats.language}`, `~${ev.stats.tokens} in-tok`);
  meta.push(`${tests.length} file(s)`);
  if (ev.out_dir) meta.push(`saved: ${ev.out_dir}`);
  $("result_meta").textContent = meta.join("  ::  ");
  const total = tests.length + human.length;
  $("files_tab").textContent = total ? `FILES (${total})` : "FILES";
  autoTab("files");

  const noLLM = "model returned no parseable test blocks. Check MODEL STREAM for raw output.";
  if (!ev.issue) {
    if (!tests.length) box.appendChild(el("div", "empty", noLLM));
    tests.forEach((t, i) => box.appendChild(fileCard(t, i === 0)));
    return;
  }

  // issue mode: the verdict on top, then the LLM's and the PR's tests side by side
  const pr = ev.issue.pr;
  const cols = el("div", "compare");
  cols.append(
    column("LLM-WRITTEN TESTS", tests, noLLM),
    column(pr ? `HUMAN TESTS :: FIX PR #${pr}` : "HUMAN TESTS", human,
      pr ? "the fix PR changed no Python test files." : "open issue: no fix PR, so no human tests yet.")
  );
  box.append(verdictBlock(ev), cols);
}

function column(title, files, emptyMsg) {
  const col = el("div", "compare-col");
  col.appendChild(el("div", "compare-head", title));
  if (!files.length) col.appendChild(el("div", "empty", emptyMsg));
  files.forEach((t, i) => col.appendChild(fileCard(t, i === 0)));
  return col;
}

function fileCard(t, open) {
  const wrap = el("details", "test-file");
  wrap.open = open;

  const lines = t.content.split("\n").length;
  const title = el("div", "tf-title");
  title.append(
    el("span", "tf-name", t.filename),
    el("span", "tf-lang", t.language || ""),
    el("span", "tf-lines", t.diff ? `PR diff :: file is ${lines} lines` : `${lines} lines`)
  );

  const actions = el("div", "tf-actions");
  const copyBtn = mkBtn("COPY", () => {
    navigator.clipboard.writeText(t.content);
    copyBtn.textContent = "COPIED";
    setTimeout(() => (copyBtn.textContent = "COPY"), 1200);
  });
  const dlBtn = mkBtn("DOWNLOAD", () =>
    downloadFile(t.filename.split("/").pop(), t.content)
  );
  actions.append(copyBtn, dlBtn);

  const head = document.createElement("summary");
  head.append(title, actions);
  // a human test file can be thousands of lines; the PR diff is what the maintainer wrote
  wrap.append(head, t.diff ? diffPre(t.diff) : el("pre", "", t.content));
  return wrap;
}

function diffPre(diff) {
  const pre = el("pre", "diff");
  for (const line of diff.split("\n"))
    pre.appendChild(el("span", { "+": "add", "-": "del", "@": "hunk" }[line[0]] || "", line + "\n"));
  return pre;
}

/* issue mode: where each suite landed in the specified/programmed/tested Venn */
const EXIT = { 0: "PASS", 1: "FAIL", 5: "NONE", "-1": "TIMEOUT" };
const exitLbl = (c) => (c == null ? "-" : EXIT[c] || "ERROR");
const SUITE = { llm: "LLM", human: "HUMAN (PR)" };
const GOOD = ["caught the bug", "fails at base (as it should)"]; // mirrors issues.py
// closed-issue regions in grid order: [exit at buggy, exit at fixed, name, meaning]
const REGIONS = [
  [1, 0, "caught the bug", "reproduces the issue, the fix resolves it"],
  [1, 1, "fails at both", "wrong API or wrong behaviour"],
  [0, 0, "redundant", "never touched the bug"],
  [0, 1, "contradicts the fix", "tests the old behaviour"],
];

function verdictBlock(ev) {
  const iss = ev.issue;
  const v = ev.verdicts || {};
  const ran = Object.keys(v);
  const box = el("div", "verdict");
  box.appendChild(el("div", "v-title", `ISSUE #${iss.number} [${iss.state}]  ${iss.title}`));
  if (iss.pr)
    box.appendChild(el("div", "v-sub",
      `fixed by PR #${iss.pr}  ::  buggy ${iss.base.slice(0, 10)}  ->  fixed ${iss.head.slice(0, 10)}`));

  if (!ran.length) box.appendChild(el("div", "empty", "(nothing was run)"));
  else {
    const table = el("table", "v-table");
    table.createTHead().insertRow().append(
      ...["SUITE", "AT BUGGY", "AT FIXED", "REGION"].map((s) => el("th", "", s)));
    for (const k of ran) {
      const tr = table.insertRow();
      for (const s of [SUITE[k] || k, exitLbl(v[k].base), exitLbl(v[k].head), v[k].region])
        tr.insertCell().textContent = s;
      if (GOOD.includes(v[k].region)) tr.className = "good";
    }
    box.appendChild(table);
    if (iss.pr) box.appendChild(matrix(v));
  }

  for (const k of ran) {
    const r = v[k];
    let s = `--- at buggy commit: exit ${r.base} (${exitLbl(r.base)}) ---\n${r.base_out.trim()}\n`;
    if (r.head != null)
      s += `\n--- at fixed commit: exit ${r.head} (${exitLbl(r.head)}) ---\n${r.head_out.trim()}\n`;
    const d = el("details", "v-out");
    d.append(el("summary", "", `pytest output :: ${SUITE[k] || k}`), el("pre", "", s));
    box.appendChild(d);
  }

  const links = el("div", "v-links");
  links.appendChild(ghLink(iss.url, "[ open issue ]"));
  if (iss.pr)
    links.append(" ", ghLink(`https://github.com/${ev.repo}/pull/${iss.pr}`, `[ fix PR #${iss.pr} ]`));
  box.appendChild(links);
  return box;
}

// 2x2 outcome grid: rows = result at the buggy commit, columns = at the fixed commit
function matrix(v) {
  const grid = el("div", "v-matrix");
  grid.append(el("div"), el("div", "mx-col", "FIXED: PASS"), el("div", "mx-col", "FIXED: FAIL"));
  REGIONS.forEach(([b, h, name, meaning], i) => {
    if (i % 2 === 0) grid.appendChild(el("div", "mx-row", b ? "BUGGY: FAIL" : "BUGGY: PASS"));
    const who = Object.keys(v).filter((k) => v[k].base === b && v[k].head === h);
    const cell = el("div", "mx-cell" + (i === 0 ? " target" : "") + (who.length ? " hit" : ""));
    cell.append(el("div", "mx-name", name), el("div", "mx-meaning", meaning));
    for (const k of who) cell.appendChild(el("span", "badge", SUITE[k] || k));
    grid.appendChild(cell);
  });
  return grid;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function ghLink(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

function mkBtn(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tf-btn";
  b.textContent = label;
  b.addEventListener("click", (e) => {
    e.preventDefault(); // don't toggle the <details> the button sits in
    e.stopPropagation();
    onClick();
  });
  return b;
}

function downloadFile(name, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "test.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------ wire ------------------------------ */
$("provider").addEventListener("change", onProviderChange);
$("run_btn").addEventListener("click", run);
$("stop_btn").addEventListener("click", () => abortController && abortController.abort());
["repo_url", "ref", "issue"].forEach((id) =>
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  })
);
$("repo_url").addEventListener("input", () => {
  $("repo_url").classList.remove("invalid");
  // a different repo makes the old issue number meaningless
  if ($("repo_url").value.trim() !== issuesLoadedFor) {
    $("issue").value = "";
    updateIssueUI();
  }
});

/* issue mode: the repo's open + closed issues feed the ISSUE # datalist and
   the hint line under it. Reloaded whenever the repo changes. */
let ISSUES = {};
let issuesLoadedFor = "";
async function loadIssues() {
  const repo = $("repo_url").value.trim();
  if (!repo || repo === issuesLoadedFor) return;
  issuesLoadedFor = repo;
  const dl = $("issue_list");
  dl.innerHTML = "";
  ISSUES = {};
  try {
    const res = await fetch("/api/issues?repo=" + encodeURIComponent(repo));
    const list = await res.json();
    if (!res.ok) throw new Error(list.detail || "HTTP " + res.status);
    for (const i of list) {
      ISSUES[i.number] = i;
      const o = document.createElement("option");
      o.value = i.number;
      o.label = `[${i.state}] ${i.title}`;
      dl.appendChild(o);
    }
    log("info", "ISSUES", `${list.length} issue(s) listed for ${repo} (newest first)`);
  } catch (e) {
    issuesLoadedFor = "";
    log("warn", "ISSUES", "Could not list issues: " + e.message);
  }
  updateIssueUI();
}

// show what RUN will do and which issue was picked, before running anything
function updateIssueUI() {
  const n = parseInt($("issue").value, 10) || null;
  const info = n && ISSUES[n];
  $("issue_hint").textContent = info ? `[${info.state}] ${info.title}` : "";
  $("run_btn").textContent = n ? `>> RUN ISSUE #${n}` : ">> RUN GENERATION";
  // issue mode always runs pytest and never sends the repo's own tests
  for (const id of ["verify", "skip_tests"]) $(id).disabled = !!n;
}
$("issue").addEventListener("focus", loadIssues);
$("issue").addEventListener("input", updateIssueUI);
$("repo_url").addEventListener("change", loadIssues);

$("reset_btn").addEventListener("click", () => {
  localStorage.removeItem("testforge");
  location.reload();
});

$("cfg_toggle").addEventListener("click", () =>
  setCfgCollapsed(!document.querySelector(".controls").classList.contains("collapsed"))
);

document.querySelector(".tabbar").addEventListener("click", (e) => {
  const b = e.target.closest(".tab-btn");
  if (!b) return;
  userPickedTab = true;
  setTab(b.dataset.tab);
});

// persist every field on change
document.querySelectorAll("input, select").forEach((el) =>
  el.addEventListener("change", saveState)
);

// info bubbles: a click on (i) must not toggle the checkbox/label it sits in,
// and the tooltip is shifted so it never clips at the viewport edge.
function positionTip(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const w = Math.min(240, window.innerWidth * 0.78);
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  el.style.setProperty("--tip-shift", left - r.left + "px");
}
document.querySelectorAll(".tip").forEach((el) => {
  el.addEventListener("click", (e) => e.preventDefault());
  el.addEventListener("pointerenter", positionTip);
  el.addEventListener("focus", positionTip);
});

// restore persisted plain fields (provider/model restore inside loadProviders)
["repo_url", "ref", "issue", "model_custom", "base_url", "max_files", "max_kb",
 "framework_hint", "include_globs", "skip_tests",
 "write_output", "verify"].forEach(restoreField);

loadProviders();
updateIssueUI();
loadIssues();
