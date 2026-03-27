#!/usr/bin/env node
// MerryNote dashboard server - zero external dependencies
// Usage: node server/server.js [port]  |  npx merrynote serve

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec, execSync } = require("child_process");

const HOME = os.homedir();
const BRAND = "MerryNote";
const PRIMARY_SERVICE_LABEL = "com.mysc.merrynote";
const LEGACY_SERVICE_LABEL = "com.mysc.yapnotes";
const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "web");
const REPO_VOCAB_DIR = path.join(ROOT, "vocab");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const RAYCAST_DIR = path.join(ROOT, "raycast-scripts");
const PRIMARY_DATA_ROOT = path.join(HOME, ".merrynote");
const LEGACY_DATA_ROOT = path.join(HOME, ".yapnotes");
const HOSTED_MODE_HINT = String(process.env.MERRYNOTE_HOSTED_MODE || process.env.MERRYNOTE_RUNTIME || "").toLowerCase();
const HOSTED_MODE =
  HOSTED_MODE_HINT === "1" ||
  HOSTED_MODE_HINT === "true" ||
  HOSTED_MODE_HINT === "hosted" ||
  Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const PORT = parseInt(process.env.PORT || process.env.MERRYNOTE_PORT || process.env.YAPNOTES_PORT || process.argv[2] || "7373", 10);
const HOST = process.env.MERRYNOTE_HOST || (HOSTED_MODE ? "0.0.0.0" : "127.0.0.1");
const DATA_ROOT = process.env.MERRYNOTE_DATA_DIR || "";
const PRIMARY_CONFIG_FILE = process.env.MERRYNOTE_CONFIG_FILE || (HOSTED_MODE && DATA_ROOT ? path.join(DATA_ROOT, "config.json") : path.join(PRIMARY_DATA_ROOT, "config.json"));
const LEGACY_CONFIG_FILE = path.join(LEGACY_DATA_ROOT, "config.json");
const PRIMARY_LOG_FILE = process.env.MERRYNOTE_LOG_FILE || (HOSTED_MODE && DATA_ROOT ? path.join(DATA_ROOT, "logs", "merrynote.log") : path.join(PRIMARY_DATA_ROOT, "merrynote.log"));
const LEGACY_LOG_FILE = path.join(LEGACY_DATA_ROOT, "yapnotes.log");
const PRIMARY_PLIST_FILE = path.join(HOME, "Library", "LaunchAgents", "com.mysc.merrynote.plist");
const LEGACY_PLIST_FILE = path.join(HOME, "Library", "LaunchAgents", "com.mysc.yapnotes.plist");
const PRIMARY_ICLOUD_INBOX = path.join(HOME, "Library/Mobile Documents/com~apple~CloudDocs/merrynote-inbox");
const LEGACY_ICLOUD_INBOX = path.join(HOME, "Library/Mobile Documents/com~apple~CloudDocs/yapnotes-inbox");
const DEFAULT_NOTES_DIR = process.env.MERRYNOTE_NOTES_DIR || (HOSTED_MODE && DATA_ROOT ? path.join(DATA_ROOT, "notes") : path.join(HOME, "meeting-notes"));
const VOCAB_DIR = process.env.MERRYNOTE_VOCAB_DIR || (HOSTED_MODE && DATA_ROOT ? path.join(DATA_ROOT, "vocab") : REPO_VOCAB_DIR);

function firstExisting(primary, legacy) {
  if (fs.existsSync(primary)) return primary;
  if (legacy && fs.existsSync(legacy)) return legacy;
  return primary;
}

const CONFIG_FILE = HOSTED_MODE ? PRIMARY_CONFIG_FILE : firstExisting(PRIMARY_CONFIG_FILE, LEGACY_CONFIG_FILE);
const LOG_FILE = HOSTED_MODE ? PRIMARY_LOG_FILE : firstExisting(PRIMARY_LOG_FILE, LEGACY_LOG_FILE);
const PLIST_FILE = HOSTED_MODE ? PRIMARY_PLIST_FILE : firstExisting(PRIMARY_PLIST_FILE, LEGACY_PLIST_FILE);

function runtimeInfo() {
  return {
    mode: HOSTED_MODE ? "hosted" : "local",
    hosted: HOSTED_MODE,
    platform: process.platform,
    host: HOST,
    port: PORT,
    capabilities: {
      daemonControl: !HOSTED_MODE && process.platform === "darwin",
      voiceMemosRecording: !HOSTED_MODE && process.platform === "darwin",
      localFileTranscription: !HOSTED_MODE,
      vocabEditing: true,
      cloudUploadIntake: false,
    },
  };
}

function seedFile(target, fallback) {
  if (fs.existsSync(target) || !fs.existsSync(fallback)) return;
  fs.copyFileSync(fallback, target);
}

function ensureRuntimeState() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "");

  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.mkdirSync(DEFAULT_NOTES_DIR, { recursive: true });

  fs.mkdirSync(VOCAB_DIR, { recursive: true });
  seedFile(path.join(VOCAB_DIR, "glossary.md"), path.join(REPO_VOCAB_DIR, "glossary.md"));
  seedFile(path.join(VOCAB_DIR, "names.md"), path.join(REPO_VOCAB_DIR, "names.md"));
  seedFile(path.join(VOCAB_DIR, "custom-terms.md"), path.join(REPO_VOCAB_DIR, "custom-terms.md"));
}

function currentServiceLabel() {
  if (HOSTED_MODE) return PRIMARY_SERVICE_LABEL;
  if (isDaemonRunningFor(PRIMARY_SERVICE_LABEL) || fs.existsSync(PRIMARY_PLIST_FILE)) return PRIMARY_SERVICE_LABEL;
  if (isDaemonRunningFor(LEGACY_SERVICE_LABEL) || fs.existsSync(LEGACY_PLIST_FILE)) return LEGACY_SERVICE_LABEL;
  return PRIMARY_SERVICE_LABEL;
}

function isDaemonRunningFor(label) {
  if (HOSTED_MODE || process.platform !== "darwin") return false;
  try {
    return execSync(`launchctl list ${label} 2>/dev/null`, { encoding: "utf8" }).includes('"PID"');
  } catch {
    return false;
  }
}

function isDaemonRunning() {
  return isDaemonRunningFor(currentServiceLabel());
}

function cfg() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return { output_dir: DEFAULT_NOTES_DIR, watch_downloads: !HOSTED_MODE };
  }
}

function notesDir() {
  return process.env.MERRYNOTE_NOTES_DIR || cfg().output_dir || DEFAULT_NOTES_DIR;
}

const GOVERNANCE_PATTERNS = [
  /예산/,
  /비용/,
  /승인/,
  /리스크/,
  /윤리/,
  /데이터(?:\s*세트|셋)/,
  /준비도/,
];

function extractMarkdownSection(content, headingPattern) {
  const headingRe = new RegExp(`^##\\s+${headingPattern}\\s*$`);
  const lines = content.split("\n");
  const collected = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!inSection) {
      if (headingRe.test(line)) inSection = true;
      continue;
    }
    if (/^##\s+/.test(line)) break;
    collected.push(rawLine);
  }

  return collected.join("\n").trim();
}

function countSectionItems(section) {
  if (!section) return 0;
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line) || /^\d+\.\s+/.test(line))
    .length;
}

function governanceFlagCount(content) {
  return GOVERNANCE_PATTERNS.reduce((count, pattern) => count + (pattern.test(content) ? 1 : 0), 0);
}

function noteSignals(content) {
  const decisions = countSectionItems(extractMarkdownSection(content, "결정 사항"));
  const actionItems = countSectionItems(extractMarkdownSection(content, "액션 아이템"));
  const openItems = countSectionItems(extractMarkdownSection(content, "미결 사항(?:\\s*\\/\\s*추가 논의 필요)?"));
  const governanceFlags = governanceFlagCount(content);
  return { decisions, actionItems, openItems, governanceFlags };
}

function watchedFolders() {
  if (HOSTED_MODE) return [];
  const config = cfg();
  const folders = [PRIMARY_ICLOUD_INBOX];
  if (fs.existsSync(LEGACY_ICLOUD_INBOX)) folders.push(LEGACY_ICLOUD_INBOX);
  if (config.watch_downloads !== false) folders.push(path.join(HOME, "Downloads"));
  if (config.extra_watch_dir) folders.push(config.extra_watch_dir);
  return folders;
}

const sseClients = new Set();
function broadcast(type, data) {
  const msg = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

ensureRuntimeState();
let logPos = fs.statSync(LOG_FILE).size;
fs.watch(LOG_FILE, () => {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < logPos) logPos = 0;
    if (stat.size === logPos) return;
    const buf = Buffer.alloc(stat.size - logPos);
    const fd = fs.openSync(LOG_FILE, "r");
    fs.readSync(fd, buf, 0, buf.length, logPos);
    fs.closeSync(fd);
    logPos = stat.size;
    buf
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((line) => broadcast("log", { line }));
    broadcast("status", { running: isDaemonRunning() });
  } catch {}
});

function watchNotes() {
  const dir = notesDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.watch(dir, (evt, file) => {
    if (file && file.endsWith(".md")) broadcast("note", { file });
  });
}

function getNotes() {
  const dir = notesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const fp = path.join(dir, file);
      const stat = fs.statSync(fp);
      const content = fs.readFileSync(fp, "utf8");
      const words = content.trim().split(/\s+/).length;
      const titleMatch = content.match(/^#\s+(.+)/m);
      const signals = noteSignals(content);
      return {
        file,
        title: titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, ""),
        date: file.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "",
        words,
        mtime: stat.mtimeMs,
        size: stat.size,
        ...signals,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function getStats() {
  const notes = getNotes();
  const totalWords = notes.reduce((sum, note) => sum + note.words, 0);
  const totalDecisions = notes.reduce((sum, note) => sum + (note.decisions || 0), 0);
  const totalActionItems = notes.reduce((sum, note) => sum + (note.actionItems || 0), 0);
  const totalOpenItems = notes.reduce((sum, note) => sum + (note.openItems || 0), 0);
  const totalGovernanceFlags = notes.reduce((sum, note) => sum + (note.governanceFlags || 0), 0);
  const byMonth = {};
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let thisMonth = 0;

  for (const note of notes) {
    const monthKey = note.date.slice(0, 7);
    if (!monthKey) continue;
    byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
    if (monthKey === thisMonthKey) thisMonth += 1;
  }

  return {
    total: notes.length,
    thisMonth,
    totalWords,
    totalDecisions,
    totalActionItems,
    totalOpenItems,
    totalGovernanceFlags,
    byMonth,
  };
}

function searchNotes(query) {
  if (!query) return [];
  const dir = notesDir();
  if (!fs.existsSync(dir)) return [];
  const queryLower = query.toLowerCase();
  return fs.readdirSync(dir).filter((file) => file.endsWith(".md")).flatMap((file) => {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    const idx = content.toLowerCase().indexOf(queryLower);
    if (idx < 0) return [];
    const start = Math.max(0, idx - 80);
    const end = Math.min(content.length, idx + 160);
    return [{ file, excerpt: `…${content.slice(start, end).replace(/\n+/g, " ")}…` }];
  });
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ico": "image/x-icon",
};
const LOOPBACK_ORIGIN_RE = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?$/;

function jsonRes(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !LOOPBACK_ORIGIN_RE.test(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
}

function router(req, res) {
  applyCors(req, res);
  const baseUrl = `${(req.headers["x-forwarded-proto"] || "http").split(",")[0]}://${req.headers.host || `localhost:${PORT}`}`;
  const raw = new URL(req.url, baseUrl);
  const p = raw.pathname;
  const q = Object.fromEntries(raw.searchParams);
  const method = req.method.toUpperCase();

  if (p === "/healthz") {
    return jsonRes(res, {
      ok: true,
      runtime: runtimeInfo(),
      notesDir: notesDir(),
      vocabDir: VOCAB_DIR,
    });
  }

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!p.startsWith("/api/")) {
    const fp = path.join(WEB, p === "/" ? "index.html" : p);
    if (fs.existsSync(fp)) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "text/plain" });
      return res.end(fs.readFileSync(fp));
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (p === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: "status", running: isDaemonRunning() })}\n\n`);
    try {
      const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean).slice(-30);
      lines.forEach((line) => res.write(`data: ${JSON.stringify({ type: "log", line })}\n\n`));
    } catch {}
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (method === "POST" || method === "PUT") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let json = {};
      try {
        json = JSON.parse(body);
      } catch {}
      handleApi(p, method, q, json, res);
    });
    return;
  }

  handleApi(p, method, q, {}, res);
}

function handleApi(p, method, q, body, res) {
  if (p === "/api/runtime" && method === "GET") {
    return jsonRes(res, runtimeInfo());
  }

  if (p === "/api/status" && method === "GET") {
    const config = cfg();
    return jsonRes(res, {
      running: isDaemonRunning(),
      watching: watchedFolders(),
      outputDir: notesDir(),
      runtime: runtimeInfo(),
    });
  }

  if (p === "/api/daemon/start" && method === "POST") {
    if (HOSTED_MODE) return jsonRes(res, { ok: false, error: "Hosted mode does not support launchctl daemon control." }, 501);
    try {
      execSync(`launchctl load "${PLIST_FILE}" 2>/dev/null`);
      return jsonRes(res, { ok: true });
    } catch (e) {
      return jsonRes(res, { ok: false, error: e.message }, 500);
    }
  }

  if (p === "/api/daemon/stop" && method === "POST") {
    if (HOSTED_MODE) return jsonRes(res, { ok: false, error: "Hosted mode does not support launchctl daemon control." }, 501);
    try {
      execSync(`launchctl unload "${PLIST_FILE}" 2>/dev/null`);
      return jsonRes(res, { ok: true });
    } catch (e) {
      return jsonRes(res, { ok: false, error: e.message }, 500);
    }
  }

  if (p === "/api/notes" && method === "GET") return jsonRes(res, getNotes());

  if (p.startsWith("/api/notes/")) {
    const file = decodeURIComponent(p.slice("/api/notes/".length));
    const fp = path.join(notesDir(), path.basename(file));
    if (!fs.existsSync(fp)) return jsonRes(res, { error: "Not found" }, 404);
    if (method === "GET") return jsonRes(res, { content: fs.readFileSync(fp, "utf8") });
    if (method === "DELETE") {
      fs.unlinkSync(fp);
      return jsonRes(res, { ok: true });
    }
  }

  if (p === "/api/logs" && method === "GET") {
    const n = parseInt(q.n || "100", 10);
    try {
      const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
      return jsonRes(res, { lines: lines.slice(-n) });
    } catch {
      return jsonRes(res, { lines: [] });
    }
  }

  if (p === "/api/vocab" && method === "GET") {
    try {
      return jsonRes(res, {
        glossary: fs.readFileSync(path.join(VOCAB_DIR, "glossary.md"), "utf8"),
        names: fs.readFileSync(path.join(VOCAB_DIR, "names.md"), "utf8"),
      });
    } catch (e) {
      return jsonRes(res, { error: e.message }, 500);
    }
  }

  if (p === "/api/vocab/glossary" && method === "PUT") {
    try {
      fs.writeFileSync(path.join(VOCAB_DIR, "glossary.md"), body.content || "", "utf8");
      return jsonRes(res, { ok: true });
    } catch (e) {
      return jsonRes(res, { error: e.message }, 500);
    }
  }

  if (p === "/api/stats" && method === "GET") return jsonRes(res, getStats());
  if (p === "/api/search" && method === "GET") return jsonRes(res, searchNotes(q.q));

  if (p === "/api/transcribe" && method === "POST") {
    if (HOSTED_MODE) {
      return jsonRes(
        res,
        { ok: false, error: "Hosted mode does not support server-local file path transcription yet. Ship browser upload + worker first." },
        501
      );
    }
    const file = body.file;
    if (!file) return jsonRes(res, { error: "file required" }, 400);
    if (!fs.existsSync(file)) return jsonRes(res, { error: `파일 없음: ${file}` }, 400);
    jsonRes(res, { ok: true });
    exec(`bash "${path.join(SCRIPTS_DIR, "transcribe-selected.sh")}" "${file}"`, (err) => {
      if (err) broadcast("log", { line: `❌ 전사 오류: ${err.message}` });
    });
    return;
  }

  if (p === "/api/record/start" && method === "POST") {
    if (HOSTED_MODE) return jsonRes(res, { ok: false, error: "Hosted mode cannot control macOS Voice Memos." }, 501);
    exec(`osascript "${path.join(RAYCAST_DIR, "record-meeting-helper.applescript")}"`, (err) => {
      if (err) broadcast("log", { line: `❌ 녹음 시작 실패: ${err.message}` });
      else broadcast("log", { line: "🎙️  녹음 시작됨 (Voice Memos)" });
    });
    return jsonRes(res, { ok: true });
  }

  if (p === "/api/record/stop" && method === "POST") {
    if (HOSTED_MODE) return jsonRes(res, { ok: false, error: "Hosted mode cannot stop Voice Memos or run local Claude CLI." }, 501);
    const title = body.title || "회의";
    broadcast("log", { line: `⏹  녹음 종료 중: "${title}"` });
    exec(`osascript "${path.join(RAYCAST_DIR, "finish-meeting-helper.applescript")}" "${title}"`, (err, stdout) => {
      if (err) {
        broadcast("log", { line: `❌ 종료 실패: ${err.message}` });
        return;
      }
      const transcript = stdout.trim();
      if (!transcript || transcript.startsWith("ERROR:")) {
        broadcast("log", { line: `❌ 전사 실패: ${transcript}` });
        return;
      }
      broadcast("log", { line: `✅ 전사 완료 (${transcript.split(/\s+/).length} 단어)` });

      const claudePath = (() => {
        try {
          return execSync("which claude", { encoding: "utf8" }).trim();
        } catch {
          return "";
        }
      })();

      if (!claudePath) return;

      const tmpFile = `/tmp/merrynote-transcript-${Date.now()}.txt`;
      fs.writeFileSync(tmpFile, `${title}\n\n${transcript}`);
      broadcast("log", { line: "📝 Claude 회의록 생성 중..." });
      exec(
        `printf '/meeting-notes %s\\n\\n%s' "${title}" "${transcript.replace(/"/g, '\\"')}" | "${claudePath}" -p --dangerously-skip-permissions`,
        (e, out) => {
          fs.unlinkSync(tmpFile);
          if (e || !out) {
            broadcast("log", { line: "⚠️  Claude 실패 — 전사문 저장" });
            return;
          }
          const outFile = path.join(notesDir(), `${new Date().toISOString().slice(0, 10)}-${title.replace(/\s+/g, "-")}.md`);
          fs.mkdirSync(notesDir(), { recursive: true });
          fs.writeFileSync(outFile, out);
          broadcast("log", { line: `📄 회의록 저장: ${path.basename(outFile)}` });
          broadcast("note", { file: path.basename(outFile) });
        }
      );
    });
    return jsonRes(res, { ok: true });
  }

  return jsonRes(res, { error: "Not found" }, 404);
}

http.createServer(router).listen(PORT, HOST, () => {
  watchNotes();
  console.log(`\n🎙️  ${BRAND} dashboard`);
  console.log(`   \x1b[36mhttp://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}\x1b[0m`);
  console.log(`   mode: ${runtimeInfo().mode}\n`);
  if (!HOSTED_MODE && process.platform === "darwin") exec(`open http://localhost:${PORT}`);
});
