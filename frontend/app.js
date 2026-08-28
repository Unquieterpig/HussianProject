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
  "repo_url", "ref", "provider", "model", "model_custom", "base_url",
  "max_files", "max_kb", "framework_hint", "include_globs",
  "swtbench_mode", "skip_tests", "write_output",
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
    include_globs: globs,
    skip_tests: $("skip_tests").checked,
    max_files: parseInt($("max_files").value, 10) || 10,
    max_bytes: (parseInt($("max_kb").value, 10) || 120) * 1024,
    framework_hint: $("framework_hint").value.trim() || null,
    swtbench_mode: $("swtbench_mode").checked,
    write_output: $("write_output").checked,
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
            setProgress(ev.progress, ev.stage, ev.message);
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
            break;
          case "error":
            log("err", "ERROR", ev.message);
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
    } else {
      log("err", "ERROR", e.message);
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
  const box = $("results");
  box.innerHTML = "";

  const meta = [];
  if (ev.stats) meta.push(`${ev.stats.language}`, `~${ev.stats.tokens} in-tok`);
  meta.push(`${tests.length} file(s)`);
  if (ev.out_dir) meta.push(`saved: ${ev.out_dir}`);
  $("result_meta").textContent = meta.join("  ::  ");
  $("files_tab").textContent = tests.length ? `FILES (${tests.length})` : "FILES";
  autoTab("files");

  if (!tests.length) {
    box.innerHTML =
      '<div class="empty">model returned no parseable test blocks. Check MODEL STREAM for raw output.</div>';
    return;
  }

  tests.forEach((t, i) => {
    const wrap = document.createElement("details");
    wrap.className = "test-file";
    wrap.open = i === 0; // first file expanded, rest collapsed

    const head = document.createElement("summary");
    const lines = t.content.split("\n").length;

    const title = document.createElement("div");
    title.className = "tf-title";
    title.innerHTML =
      `<span class="tf-name">${escapeHtml(t.filename)}</span>` +
      `<span class="tf-lang">${escapeHtml(t.language || "")}</span>` +
      `<span class="tf-lines">${lines} lines</span>`;

    const actions = document.createElement("div");
    actions.className = "tf-actions";
    const copyBtn = mkBtn("COPY", () => {
      navigator.clipboard.writeText(t.content);
      copyBtn.textContent = "COPIED";
      setTimeout(() => (copyBtn.textContent = "COPY"), 1200);
    });
    const dlBtn = mkBtn("DOWNLOAD", () =>
      downloadFile(t.filename.split("/").pop(), t.content)
    );
    actions.appendChild(copyBtn);
    actions.appendChild(dlBtn);

    head.appendChild(title);
    head.appendChild(actions);

    const pre = document.createElement("pre");
    pre.textContent = t.content;

    wrap.appendChild(head);
    wrap.appendChild(pre);
    box.appendChild(wrap);
  });
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
["repo_url", "ref"].forEach((id) =>
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  })
);
$("repo_url").addEventListener("input", () =>
  $("repo_url").classList.remove("invalid")
);

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
["repo_url", "ref", "model_custom", "base_url", "max_files", "max_kb",
 "framework_hint", "include_globs", "swtbench_mode", "skip_tests",
 "write_output"].forEach(restoreField);

loadProviders();
