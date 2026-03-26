#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync, spawn, spawnSync } = require("child_process");

const HOME = process.env.HOME;
const pkgDir = path.resolve(__dirname, "..");

const BRAND = "MerryNote";
const CLI_NAME = "merrynote";
const LEGACY_CLI_NAME = "yapnotes";
const SERVICE_LABEL = "com.mysc.merrynote";
const LEGACY_SERVICE_LABEL = "com.mysc.yapnotes";
const CONFIG_DIR = path.join(HOME, ".merrynote");
const LEGACY_CONFIG_DIR = path.join(HOME, ".yapnotes");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const LEGACY_CONFIG_FILE = path.join(LEGACY_CONFIG_DIR, "config.json");
const LOG_FILE = path.join(CONFIG_DIR, "merrynote.log");
const LEGACY_LOG_FILE = path.join(LEGACY_CONFIG_DIR, "yapnotes.log");
const CACHE_DIR = path.join(HOME, ".merrynote-cache");
const LEGACY_CACHE_DIR = path.join(HOME, ".yapnotes-cache");
const PLIST_DEST = path.join(HOME, "Library/LaunchAgents/com.mysc.merrynote.plist");
const LEGACY_PLIST_DEST = path.join(HOME, "Library/LaunchAgents/com.mysc.yapnotes.plist");
const PRIMARY_INBOX_NAME = "merrynote-inbox";
const LEGACY_INBOX_NAME = "yapnotes-inbox";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function fileExists(fp) {
  try {
    return fs.existsSync(fp);
  } catch {
    return false;
  }
}

function firstExisting(primary, legacy) {
  if (fileExists(primary)) return primary;
  if (legacy && fileExists(legacy)) return legacy;
  return primary;
}

function ensureSymlink(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) return;
    if (stat.isSymbolicLink()) {
      const current = fs.readlinkSync(linkPath);
      if (current === target) return;
    }
    fs.rmSync(linkPath, { force: true, recursive: true });
  }

  try {
    fs.symlinkSync(target, linkPath);
  } catch {
    if (!fs.existsSync(linkPath) && fs.existsSync(target) && fs.statSync(target).isFile()) {
      fs.copyFileSync(target, linkPath);
    }
  }
}

function syncLegacyState() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(LEGACY_CONFIG_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  if (!fileExists(CONFIG_FILE) && fileExists(LEGACY_CONFIG_FILE)) {
    fs.copyFileSync(LEGACY_CONFIG_FILE, CONFIG_FILE);
  }
  if (!fileExists(LEGACY_CONFIG_FILE) && fileExists(CONFIG_FILE)) {
    fs.copyFileSync(CONFIG_FILE, LEGACY_CONFIG_FILE);
  }

  if (!fileExists(LOG_FILE) && fileExists(LEGACY_LOG_FILE)) {
    fs.copyFileSync(LEGACY_LOG_FILE, LOG_FILE);
  }
  if (!fileExists(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "");
  }

  ensureSymlink(LOG_FILE, LEGACY_LOG_FILE);
  if (!fileExists(LEGACY_CACHE_DIR)) ensureSymlink(CACHE_DIR, LEGACY_CACHE_DIR);

  const primaryInbox = path.join(HOME, "Library/Mobile Documents/com~apple~CloudDocs", PRIMARY_INBOX_NAME);
  const legacyInbox = path.join(HOME, "Library/Mobile Documents/com~apple~CloudDocs", LEGACY_INBOX_NAME);
  fs.mkdirSync(primaryInbox, { recursive: true });
  fs.mkdirSync(legacyInbox, { recursive: true });
}

function writeSharedConfig(config) {
  syncLegacyState();
  const payload = JSON.stringify(config, null, 2) + "\n";
  fs.writeFileSync(CONFIG_FILE, payload);
  fs.writeFileSync(LEGACY_CONFIG_FILE, payload);
}

function getLogFilePath() {
  return firstExisting(LOG_FILE, LEGACY_LOG_FILE);
}

function getInstalledPlistPath() {
  return firstExisting(PLIST_DEST, LEGACY_PLIST_DEST);
}

function isServiceRunningFor(label) {
  try {
    return execSync(`launchctl list ${label} 2>/dev/null`, { encoding: "utf-8" }).includes('"PID"');
  } catch {
    return false;
  }
}

function detectServiceLabel() {
  if (isServiceRunningFor(SERVICE_LABEL) || fileExists(PLIST_DEST)) return SERVICE_LABEL;
  if (isServiceRunningFor(LEGACY_SERVICE_LABEL) || fileExists(LEGACY_PLIST_DEST)) return LEGACY_SERVICE_LABEL;
  return SERVICE_LABEL;
}

function migrateLegacyState() {
  syncLegacyState();
}

function hasClaude() {
  try {
    execSync("which claude", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasRaycast() {
  return fileExists("/Applications/Raycast.app");
}

function hasBrew() {
  try {
    execSync("which brew", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasSwiftBar() {
  return fileExists("/Applications/SwiftBar.app") || fileExists(path.join(HOME, "Applications/SwiftBar.app"));
}

function installLaunchAgent(outputDir, watchDownloads, extraWatchDir) {
  migrateLegacyState();

  const merrynoteRoot = pkgDir;
  const plistSrc = path.join(pkgDir, "daemon", "com.mysc.merrynote.plist");
  const legacyPlistSrc = path.join(pkgDir, "daemon", "com.mysc.yapnotes.plist");
  let content = fs.readFileSync(plistSrc, "utf-8");
  content = content
    .replace(/MERRYNOTE_ROOT_PLACEHOLDER/g, merrynoteRoot)
    .replace(/LOG_FILE_PLACEHOLDER/g, LOG_FILE)
    .replace(/HOME_PLACEHOLDER/g, HOME);

  let legacyContent = fs.readFileSync(legacyPlistSrc, "utf-8");
  legacyContent = legacyContent
    .replace(/MERRYNOTE_ROOT_PLACEHOLDER/g, merrynoteRoot)
    .replace(/LOG_FILE_PLACEHOLDER/g, LOG_FILE)
    .replace(/HOME_PLACEHOLDER/g, HOME);

  fs.mkdirSync(path.dirname(PLIST_DEST), { recursive: true });
  fs.writeFileSync(PLIST_DEST, content, "utf-8");
  fs.writeFileSync(LEGACY_PLIST_DEST, legacyContent, "utf-8");

  const config = { output_dir: outputDir, watch_downloads: watchDownloads };
  if (extraWatchDir) config.extra_watch_dir = extraWatchDir;
  writeSharedConfig(config);

  try {
    execSync(`launchctl unload "${PLIST_DEST}" 2>/dev/null`, { stdio: "ignore" });
  } catch {}
  try {
    execSync(`launchctl unload "${LEGACY_PLIST_DEST}" 2>/dev/null`, { stdio: "ignore" });
  } catch {}
  execSync(`launchctl load "${PLIST_DEST}"`);
}

function installSwiftBar() {
  const pluginDirs = [
    path.join(HOME, "Library/Application Support/SwiftBar/Plugins"),
    path.join(HOME, ".swiftbar"),
  ];
  const src = path.join(pkgDir, "menubar", "merrynote.5m.sh");
  for (const dir of pluginDirs) {
    if (fileExists(path.dirname(dir)) || dir.includes("SwiftBar")) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, "merrynote.5m.sh");
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, "755");
        console.log(`   ✅ SwiftBar 플러그인 설치됨: ${dest}`);
        return;
      } catch {}
    }
  }
  console.log("   ⚠️  SwiftBar 플러그인 폴더를 찾을 수 없음");
  console.log(`   수동으로 복사: ${src}`);
}

function installRaycast(claudePath, outputDir) {
  const defaultScriptDir = path.join(HOME, "raycast-scripts");
  const scriptDir = defaultScriptDir;
  fs.mkdirSync(scriptDir, { recursive: true });

  const raycastSrc = path.join(pkgDir, "raycast-scripts");
  for (const file of fs.readdirSync(raycastSrc)) {
    const src = path.join(raycastSrc, file);
    const dest = path.join(scriptDir, file);
    if (file.endsWith(".sh")) {
      let content = fs.readFileSync(src, "utf-8");
      content = content.replace(/CLAUDE_PATH_PLACEHOLDER/g, claudePath);
      fs.writeFileSync(dest, content, "utf-8");
      fs.chmodSync(dest, "755");
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  const configFile = path.join(scriptDir, "meeting-config.json");
  fs.writeFileSync(configFile, JSON.stringify({ output_dir: outputDir, language: "ko" }, null, 2) + "\n");
  console.log(`   → Raycast 스크립트: ${scriptDir}/`);
  console.log("   Raycast 설정 > Extensions > Script Commands > Add Directories 에서 위 경로 추가하세요");
}

function handleCommand(cmd) {
  migrateLegacyState();
  const serviceLabel = detectServiceLabel();
  const plistPath = getInstalledPlistPath();
  const logPath = getLogFilePath();

  switch (cmd) {
    case "status": {
      console.log(`\n🎙️  ${BRAND} 상태\n`);
      if (fileExists(plistPath) || isServiceRunningFor(serviceLabel)) {
        const running = isServiceRunningFor(serviceLabel);
        console.log(running ? "  ✅ 데몬 실행 중" : "  ❌ 데몬 중지됨");
        console.log(`  • LaunchAgent: ${serviceLabel}`);
      } else {
        console.log(`  ❌ LaunchAgent 미설치 (npx ${CLI_NAME}로 설치하세요)`);
      }
      console.log("\n── 최근 로그 ──────────────────────────────");
      try {
        const log = execSync(`tail -20 "${logPath}" 2>/dev/null || echo "(로그 없음)"`, { encoding: "utf-8" });
        console.log(log);
      } catch {
        console.log("(로그 없음)");
      }
      break;
    }
    case "start": {
      try {
        execSync(`launchctl load "${plistPath}"`, { stdio: "inherit" });
        console.log(`✅ ${BRAND} 시작됨`);
      } catch {
        console.error(`❌ 시작 실패 (npx ${CLI_NAME}로 먼저 설치하세요)`);
      }
      break;
    }
    case "stop": {
      try {
        execSync(`launchctl unload "${plistPath}"`, { stdio: "inherit" });
        console.log(`⏹  ${BRAND} 중지됨`);
      } catch {
        console.error("❌ 중지 실패");
      }
      break;
    }
    case "logs": {
      spawnSync("tail", ["-f", logPath], { stdio: "inherit" });
      break;
    }
    case "serve": {
      const serverPath = path.join(pkgDir, "server", "server.js");
      if (!fileExists(serverPath)) {
        console.error(`❌ server/server.js 없음 — 재설치 필요: npm install -g ${CLI_NAME}`);
        process.exit(1);
      }
      const port = process.argv[3] || process.env.MERRYNOTE_PORT || process.env.YAPNOTES_PORT || "7373";
      console.log(`\n🎙️  ${BRAND} dashboard → http://localhost:${port}\n`);
      const srv = spawn(process.execPath, [serverPath, port], {
        stdio: "inherit",
        env: { ...process.env, MERRYNOTE_PORT: port },
      });
      srv.on("exit", (code) => process.exit(code ?? 0));
      break;
    }
    case "update": {
      console.log(`🔄 ${BRAND} 업데이트 중...`);
      try {
        execSync(`npm install -g ${CLI_NAME}@latest`, { stdio: "inherit" });
      } catch {
        console.log(`⚠️  ${CLI_NAME}@latest 설치 실패 — ${LEGACY_CLI_NAME}@latest로 폴백`);
        execSync(`npm install -g ${LEGACY_CLI_NAME}@latest`, { stdio: "inherit" });
      }
      try {
        execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: "ignore" });
      } catch {}
      try {
        execSync(`launchctl load "${plistPath}"`, { stdio: "ignore" });
      } catch {}
      console.log("✅ 업데이트 완료 & 데몬 재시작됨");
      break;
    }
    default:
      console.log(`알 수 없는 명령: ${cmd}`);
      console.log("사용 가능: setup | status | start | stop | logs | serve | update");
  }
}

async function main() {
  migrateLegacyState();

  console.log("");
  console.log(`🎙️  ${BRAND} — Your meeting notes write themselves.`);
  console.log("   말만 하세요. 회의록은 알아서 써집니다.");
  console.log("=================================================");
  console.log("");

  try {
    const osVersion = execSync("sw_vers -productVersion", { encoding: "utf-8" }).trim();
    const major = parseInt(osVersion.split(".")[0], 10);
    if (major < 14) {
      console.log(`⚠️  macOS ${osVersion} — macOS 14+ 권장 (현재 버전에서 일부 기능 제한)`);
      console.log("");
    }
  } catch {}

  if (!hasClaude()) {
    console.log("⚠️  Claude CLI가 설치되어 있지 않습니다.");
    console.log("   https://docs.anthropic.com/en/docs/claude-code");
    console.log("");
    const cont = await ask("Claude CLI 없이 계속할까요? (전사만 가능) (y/N) ");
    if (cont.toLowerCase() !== "y") {
      console.log("설치를 취소합니다.");
      rl.close();
      process.exit(0);
    }
  } else {
    console.log("✅ Claude CLI 감지됨");
  }

  let claudePath = "";
  try {
    claudePath = execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {}

  const defaultOutput = path.join(HOME, "meeting-notes");
  const outputDir = (await ask(`\n📁 회의록 저장 경로 (${defaultOutput}): `)).trim() || defaultOutput;
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`   → ${outputDir}`);

  console.log("\n📋 Claude Code 스킬 설치 중...");
  const skillSrc = path.join(pkgDir, "skills", "meeting-notes", "SKILL.md");
  const skillDest = path.join(process.cwd(), ".claude", "skills", "meeting-notes", "SKILL.md");
  copyFile(skillSrc, skillDest);
  console.log(`   → ${skillDest}`);

  console.log("");
  console.log("📲 iPhone AirDrop 자동 처리 설정");
  console.log("   ~/Downloads/ 폴더를 감시하면 iPhone에서 AirDrop한 오디오 파일이");
  console.log("   자동으로 전사됩니다. (별도 Shortcuts 앱 설정 불필요)");
  const watchDl = (await ask("   ~/Downloads/ 감시할까요? (Y/n) ")).trim().toLowerCase();
  const watchDownloads = watchDl !== "n";
  console.log(watchDownloads ? "   ✅ Downloads 감시 활성화" : "   ⏭  Downloads 감시 건너뜀");

  console.log("\n⚙️  백그라운드 데몬 설치 중 (로그인 시 자동 시작)...");
  try {
    installLaunchAgent(outputDir, watchDownloads, "");
    console.log("   ✅ LaunchAgent 설치 완료 — 지금부터 항상 켜져 있습니다!");
    console.log(`   📂 iCloud ${PRIMARY_INBOX_NAME}/ 감시 중`);
    console.log(`   ↺ legacy ${LEGACY_INBOX_NAME}/ 도 계속 인식합니다`);
    if (watchDownloads) console.log("   📂 ~/Downloads/ 감시 중 (AirDrop)");
  } catch (e) {
    console.log("   ⚠️  LaunchAgent 설치 실패:", e.message);
    console.log(`   수동으로 시작: npx ${CLI_NAME} start`);
  }

  console.log("");
  if (hasSwiftBar()) {
    console.log("✅ SwiftBar 감지됨 — 메뉴바 플러그인 설치할까요? (Y/n) ");
    const ans = (await ask("")).trim().toLowerCase();
    if (ans !== "n") installSwiftBar();
  } else {
    console.log(`💡 SwiftBar를 설치하면 메뉴바에서 ${BRAND} 상태를 바로 확인할 수 있어요.`);
    const ans = (await ask("   SwiftBar 설치할까요? (brew 필요) (y/N) ")).trim().toLowerCase();
    if (ans === "y" && hasBrew()) {
      try {
        execSync("brew install --cask swiftbar", { stdio: "inherit" });
        installSwiftBar();
      } catch {
        console.log("   ⚠️  SwiftBar 설치 실패 — 나중에 수동 설치 가능");
      }
    }
  }

  if (hasRaycast()) {
    console.log("");
    console.log("✅ Raycast 감지됨");
    const ans = (await ask("   Raycast 스크립트 커맨드 설치할까요? (Y/n) ")).trim().toLowerCase();
    if (ans !== "n") installRaycast(claudePath, outputDir);
  }

  console.log("");
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│  ⚙️  macOS 권한 필요                                          │");
  console.log("│                                                              │");
  console.log("│  시스템 설정 > 개인정보 보호 > 음성 인식 → 켜기             │");
  console.log("│  시스템 설정 > 개인정보 보호 > 마이크 → 터미널 앱 켜기      │");
  console.log("└──────────────────────────────────────────────────────────────┘");

  console.log("");
  console.log("==========================================================");
  console.log(`  ✅ ${BRAND} 설치 완료!`);
  console.log("==========================================================");
  console.log("");
  console.log("  📲 iPhone → Mac 전송 방법:");
  console.log("     AirDrop:  음성메모 → 공유 → AirDrop → Mac (자동 처리 ✅)");
  console.log(`     iCloud:   ~/iCloud Drive/${PRIMARY_INBOX_NAME}/ 에 파일 저장 (자동 처리 ✅)`);
  console.log("");
  console.log("  🖥  Mac에서 바로 녹음:");
  if (hasRaycast()) {
    console.log('     Raycast → "Record Meeting" → 회의 → "Finish Record Meeting"');
  }
  console.log("");
  console.log("  ⌨️  Claude Code 스킬:");
  console.log("     /meeting-notes [제목] [전사문 붙여넣기]");
  console.log("");
  console.log("  🔧 관리:");
  console.log(`     npx ${CLI_NAME} serve    — 웹 대시보드 열기 (http://localhost:7373)`);
  console.log(`     npx ${CLI_NAME} status   — 상태 확인`);
  console.log(`     npx ${CLI_NAME} logs     — 로그 보기`);
  console.log(`     npx ${CLI_NAME} stop     — 중지`);
  console.log(`     npx ${CLI_NAME} update   — 업데이트`);
  console.log("");
  console.log(`  📁 회의록 저장 위치: ${outputDir}`);
  console.log("");
  console.log("  Happy noting! 🎉");
  console.log("");

  rl.close();
}

const command = process.argv[2];
if (command && command !== "setup") {
  handleCommand(command);
  process.exit(0);
}

main().catch((err) => {
  console.error("Setup error:", err.message);
  rl.close();
  process.exit(1);
});
