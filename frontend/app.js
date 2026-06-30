/* ===================================================================
   TESTFORGE frontend controller
   - loads provider presets
   - POSTs config to /api/generate and reads the NDJSON event stream
   - drives the status log, ASCII progress bar, live model stream, results
   =================================================================== */

const $ = (id) => document.getElementById(id);
const BAR_WIDTH = 40;

let PRESETS = [];
let abortController = null;

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
  // default to deepseek if present
  if (PRESETS.some((p) => p.id === "deepseek")) sel.value = "deepseek";
  onProviderChange();
}

function currentPreset() {
  return PRESETS.find((p) => p.id === $("provider").value) || {};
}

function onProviderChange() {
  const p = currentPreset();
  // Free-type input + datalist: pick a preset model or type one (custom scaffold).
  const dl = $("model_options");
  dl.innerHTML = "";
  (p.models || []).forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    dl.appendChild(o);
  });
  $("model").value = (p.models && p.models[0]) || "";
  $("model").placeholder = p.needs_base_url ? "type your model name" : "model name";

  $("base_url_field").style.display = p.needs_base_url ? "" : "none";
  $("key_status").textContent = p.id === "mock"
    ? "(not needed)"
    : p.key_present ? "(found in .env)" : "(none in .env)";
}

/* ------------------------------ log ------------------------------- */
function log(level, tag, msg) {
  const box = $("log");
  const row = document.createElement("div");
  row.className = "row " + level;
  const ts = new Date().toLocaleTimeString("en-GB");
  row.innerHTML =
    `<span class="ts">${ts}</span> ` +
    `<span class="tag">[${tag}]</span> ` +
    `<span class="${level}">${escapeHtml(msg)}</span>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
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

/* --------------------------- streaming ---------------------------- */
function buildPayload() {
  const globs = $("include_globs").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    repo_url: $("repo_url").value.trim(),
    provider: $("provider").value,
    model: $("model").value.trim(),
    base_url: $("base_url").value.trim() || null,
    api_key: $("api_key").value.trim() || null,
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
    log("warn", "INPUT", "Enter a GitHub repository first.");
    return;
  }

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
          case "reasoning":
            $("reasoning").style.display = "";
            $("reasoning").textContent += ev.text;
            $("reasoning").scrollTop = $("reasoning").scrollHeight;
            break;
          case "token":
            streamText += ev.text;
            tokenCount += 1;
            $("stream").textContent = streamText;
            $("stream").scrollTop = $("stream").scrollHeight;
            if (tokenCount % 8 === 0)
              $("token_count").textContent = tokenCount + " tok";
            break;
          case "result":
            $("token_count").textContent = tokenCount + " tok";
            renderResults(ev);
            break;
          case "error":
            log("err", "ERROR", ev.message);
            $("results").innerHTML =
              '<div class="empty">generation failed — see status log.</div>';
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

  if (!tests.length) {
    box.innerHTML =
      '<div class="empty">model returned no parseable test blocks. Check MODEL STREAM for raw output.</div>';
    return;
  }

  tests.forEach((t, i) => {
    const wrap = document.createElement("div");
    wrap.className = "test-file";

    const head = document.createElement("div");
    head.className = "tf-head";
    head.innerHTML =
      `<div><span class="tf-name">${escapeHtml(t.filename)}</span>` +
      `<span class="tf-lang">${escapeHtml(t.language || "")}</span></div>`;

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
  b.className = "tf-btn";
  b.textContent = label;
  b.addEventListener("click", onClick);
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
$("repo_url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});

loadProviders();
