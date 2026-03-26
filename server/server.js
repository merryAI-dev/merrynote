#!/usr/bin/env node
// MerryNote local web server - zero external dependencies
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
const PORT = parseInt(process.env.MERRYNOTE_PORT || process.env.YAPNOTES_PORT || process.argv[2] || "7373", 10);
const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "web");

const PRIMARY_CONFIG_FILE = path.join(HOME, ".merrynote", "config.json");
const LEGACY_CONFIG_FILE = path.join(HOME, ".yapnotes", "config.json");
const PRIMARY_LOG_FILE = path.join(HOME, ".merrynote", "merrynote.log");
const LEGACY_LOG_FILE = path.join(HOME, ".yapnotes", "yapnotes.log");
const PRIMARY_PLIST_FILE = path.join(HOME, "Library", "LaunchAgents", "com.mysc.merrynote.plist");
const LEGACY_PLIST_FILE = path.join(HOME, "Library", "LaunchAgents", "com.mysc.yapnotes.plist");
const PRIMARY_ICLOUD_INBOX = path.join(HOME, "Library/Mobile Documents/com~apple~CloudDocs/merrynote-inbox");
const LEGACY_ICLOUD_INBOX = path.join(HOME, "Library/Mobile Documents/com~apple~CloudDocs/yapnotes-inbox");
const VOCAB_DIR = path.join(ROOT, "vocab");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const RAYCAST_DIR = path.join(ROOT, "raycast-scripts");

function firstExisting(primary, legacy) {
  if (fs.existsSync(primary)) return primary;
  if (legacy && fs.existsSync(legacy)) return legacy;
  return primary;
}

const CONFIG_FILE = firstExisting(PRIMARY_CONFIG_FILE, LEGACY_CONFIG_FILE);
const LOG_FILE = firstExisting(PRIMARY_LOG_FILE, LEGACY_LOG_FILE);
const PLIST_FILE = firstExisting(PRIMARY_PLIST_FILE, LEGACY_PLIST_FILE);

function currentServiceLabel() {
  if (isDaemonRunningFor(PRIMARY_SERVICE_LABEL) || fs.existsSync(PRIMARY_PLIST_FILE)) return PRIMARY_SERVICE_LABEL;
  if (isDaemonRunningFor(LEGACY_SERVICE_LABEL) || fs.existsSync(LEGACY_PLIST_FILE)) return LEGACY_SERVICE_LABEL;
  return PRIMARY_SERVICE_LABEL;
}

function isDaemonRunningFor(label) {
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
    return { output_dir: path.join(HOME, "meeting-notes"), watch_downloads: true };
  }
}

function notesDir() {
  return cfg().output_dir || path.join(HOME, "meeting-notes");
}

function watchedFolders() {
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

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "");
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
      return {
        file,
        title: titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, ""),
        date: file.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "",
        words,
        mtime: stat.mtimeMs,
        size: stat.size,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function getStats() {
  const notes = getNotes();
  const totalWords = notes.reduce((sum, note) => sum + note.words, 0);
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

  return { total: notes.length, thisMonth, totalWords, byMonth };
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
  if (p === "/api/status" && method === "GET") {
    const config = cfg();
    return jsonRes(res, {
      running: isDaemonRunning(),
      watching: watchedFolders(),
      outputDir: config.output_dir,
    });
  }

  if (p === "/api/daemon/start" && method === "POST") {
    try {
      execSync(`launchctl load "${PLIST_FILE}" 2>/dev/null`);
      return jsonRes(res, { ok: true });
    } catch (e) {
      return jsonRes(res, { ok: false, error: e.message }, 500);
    }
  }

  if (p === "/api/daemon/stop" && method === "POST") {
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
    exec(`osascript "${path.join(RAYCAST_DIR, "record-meeting-helper.applescript")}"`, (err) => {
      if (err) broadcast("log", { line: `❌ 녹음 시작 실패: ${err.message}` });
      else broadcast("log", { line: "🎙️  녹음 시작됨 (Voice Memos)" });
    });
    return jsonRes(res, { ok: true });
  }

  if (p === "/api/record/stop" && method === "POST") {
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

http.createServer(router).listen(PORT, "127.0.0.1", () => {
  watchNotes();
  console.log(`\n🎙️  ${BRAND} dashboard`);
  console.log(`   \x1b[36mhttp://localhost:${PORT}\x1b[0m\n`);
  exec(`open http://localhost:${PORT}`);
});
