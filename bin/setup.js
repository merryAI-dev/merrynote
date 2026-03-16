#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
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
  try {
    return fs.existsSync("/Applications/Raycast.app");
  } catch {
    return false;
  }
}

function hasBrew() {
  try {
    execSync("which brew", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installRaycastApp() {
  if (!hasBrew()) {
    console.log("");
    console.log("⚠️  Homebrew not found. Install Raycast manually:");
    console.log("   Homebrew가 없습니다. Raycast를 직접 설치해주세요:");
    console.log("   https://raycast.com/");
    return false;
  }
  console.log("");
  console.log("📦 Installing Raycast via Homebrew...");
  console.log("   Homebrew로 Raycast를 설치합니다...");
  try {
    execSync("brew install --cask raycast", { stdio: "inherit" });
    console.log("✅ Raycast installed! / Raycast 설치 완료!");
    return true;
  } catch {
    console.log("⚠️  Installation failed. Install manually: https://raycast.com/");
    console.log("   설치에 실패했습니다. 직접 설치해주세요: https://raycast.com/");
    return false;
  }
}

async function main() {
  console.log("");
  console.log("🎙️  yapnotes — Just yap, notes write themselves.");
  console.log("   말만 하세요. 회의록은 알아서 써집니다.");
  console.log("=================================================");
  console.log("");

  // Check macOS version
  try {
    const osVersion = execSync("sw_vers -productVersion", { encoding: "utf-8" }).trim();
    const major = parseInt(osVersion.split(".")[0], 10);
    if (major < 26) {
      console.log(`⚠️  macOS ${osVersion} detected.`);
      console.log("   Voice Memos transcript requires macOS Tahoe (26) or later.");
      console.log(`   현재 macOS ${osVersion}입니다. 음성 메모 전사문은 macOS Tahoe (26) 이상이 필요합니다.`);
      console.log("   Claude Code skill (manual paste) will still work.");
      console.log("   Claude Code 스킬 (수동 붙여넣기)은 사용할 수 있습니다.");
      console.log("");
    }
  } catch {
    // skip version check if sw_vers fails
  }

  // Check Claude CLI
  if (!hasClaude()) {
    console.log("⚠️  Claude CLI not found.");
    console.log("   Claude CLI가 설치되어 있지 않습니다.");
    console.log("   https://docs.anthropic.com/en/docs/claude-code");
    console.log("");
    const cont = await ask("Continue without Claude CLI? / Claude CLI 없이 계속할까요? (y/N) ");
    if (cont.toLowerCase() !== "y") {
      console.log("Setup cancelled. / 설치를 취소합니다.");
      rl.close();
      process.exit(0);
    }
  } else {
    console.log("✅ Claude CLI detected / Claude CLI 감지됨");
  }

  // Detect Claude CLI path
  let claudePath = "";
  try {
    claudePath = execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    claudePath = "/usr/local/bin/claude";
  }

  // Step 1: Output directory
  const defaultOutput = path.join(process.env.HOME, "meeting-notes");
  const outputDir =
    (
      await ask(
        `\n📁 Output directory for summary files / 요약 파일 저장 경로\n   (${defaultOutput}): `
      )
    ).trim() || defaultOutput;
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`   → ${outputDir}`);

  // Step 2: Install Claude Code Skill
  console.log("");
  console.log("📋 Installing Claude Code skill...");
  console.log("   Claude Code 스킬을 설치합니다...");
  const pkgDir = path.resolve(__dirname, "..");
  const skillSrc = path.join(pkgDir, "skills", "meeting-notes", "SKILL.md");
  const cwd = process.cwd();
  const skillDest = path.join(cwd, ".claude", "skills", "meeting-notes", "SKILL.md");
  copyFile(skillSrc, skillDest);
  console.log(`   → ${skillDest}`);
  console.log('   Use "/meeting-notes" in Claude Code.');
  console.log('   Claude Code에서 "/meeting-notes"로 사용할 수 있습니다.');

  // Step 3: Raycast (optional)
  let raycastReady = hasRaycast();
  let installRaycast = false;

  if (raycastReady) {
    console.log("");
    console.log("✅ Raycast detected / Raycast 감지됨");
    const ans = await ask(
      "   Install Raycast script commands? / Raycast 스크립트 커맨드를 설치할까요? (Y/n) "
    );
    installRaycast = ans.toLowerCase() !== "n";
  } else {
    console.log("");
    console.log("❌ Raycast not found. / Raycast가 설치되어 있지 않습니다.");
    const ans = await ask(
      "   Install Raycast? (Enables voice recording + auto-summarize)\n   Raycast를 설치할까요? (음성 녹음 + 자동 요약 기능 사용 가능) (Y/n) "
    );
    if (ans.toLowerCase() !== "n") {
      raycastReady = installRaycastApp();
      installRaycast = raycastReady;
    } else {
      const skipAns = await ask(
        "   Skip Raycast and use Claude Code skill only?\n   Raycast 없이 Claude Code 스킬만 사용할까요? (Y/n) "
      );
      installRaycast = skipAns.toLowerCase() === "n";
    }
  }

  if (installRaycast) {
    const defaultScriptDir = path.join(process.env.HOME, "raycast-scripts");
    const scriptDir =
      (
        await ask(
          `\n📂 Raycast script directory / Raycast 스크립트 저장 경로\n   (${defaultScriptDir}): `
        )
      ).trim() || defaultScriptDir;
    fs.mkdirSync(scriptDir, { recursive: true });

    // Copy raycast scripts
    const raycastSrc = path.join(pkgDir, "raycast-scripts");
    const scripts = fs.readdirSync(raycastSrc);
    for (const file of scripts) {
      const src = path.join(raycastSrc, file);
      const dest = path.join(scriptDir, file);

      if (file.endsWith(".sh")) {
        let content = fs.readFileSync(src, "utf-8");
        content = content.replace(
          /CLAUDE_PATH_PLACEHOLDER/g,
          claudePath
        );
        fs.writeFileSync(dest, content, "utf-8");
        fs.chmodSync(dest, "755");
      } else {
        fs.copyFileSync(src, dest);
      }
    }

    // Create config
    const configFile = path.join(scriptDir, "meeting-config.json");
    fs.writeFileSync(
      configFile,
      JSON.stringify({ output_dir: outputDir, language: "ko" }, null, 2) + "\n"
    );

    console.log(`   → Scripts installed to ${scriptDir}/`);
    console.log(`     스크립트가 ${scriptDir}/ 에 설치되었습니다.`);

    // Open Raycast so user can configure it
    console.log("");
    console.log("┌──────────────────────────────────────────────────────────────┐");
    console.log("│                                                              │");
    console.log("│  🔧 One more step to connect Raycast + yapnotes             │");
    console.log("│     Raycast와 yapnotes를 연결하는 마지막 단계입니다         │");
    console.log("│                                                              │");
    console.log("│  Raycast will open now. Follow these steps:                  │");
    console.log("│  Raycast가 열립니다. 아래 단계를 따라주세요:                 │");
    console.log("│                                                              │");
    console.log("│  1. Open Raycast Settings                                    │");
    console.log("│     Raycast 설정을 엽니다 (⌘ + ,)                           │");
    console.log("│                                                              │");
    console.log("│  2. Go to \"Extensions\" tab                                   │");
    console.log("│     \"Extensions\" 탭으로 이동합니다                           │");
    console.log("│                                                              │");
    console.log("│  3. Click \"Script Commands\" in the left sidebar              │");
    console.log("│     왼쪽 사이드바에서 \"Script Commands\"를 클릭합니다         │");
    console.log("│                                                              │");
    console.log("│  4. Click \"Add Directories\"                                  │");
    console.log("│     \"Add Directories\"를 클릭합니다                           │");
    console.log("│                                                              │");
    console.log(`│  5. Select: ${scriptDir}`);
    console.log("│                                                              │");
    console.log("│  After that, these commands will be available:               │");
    console.log("│  완료하면 아래 커맨드를 사용할 수 있습니다:                  │");
    console.log("│                                                              │");
    console.log("│  🎙️  Record Meeting          — Start recording              │");
    console.log("│                                 녹음 시작                    │");
    console.log("│  📝 Finish Record Meeting    — Stop + transcribe + summarize │");
    console.log("│                                 녹음 종료 + 전사문 추출 + 요약│");
    console.log("│  📋 Summarize Transcript     — Summarize clipboard text      │");
    console.log("│                                 클립보드 텍스트 요약         │");
    console.log("│  ⚙️  Set Meeting Output Path  — Change save location         │");
    console.log("│                                 저장 경로 변경               │");
    console.log("│                                                              │");
    console.log("└──────────────────────────────────────────────────────────────┘");

    try {
      execSync("open -a Raycast", { stdio: "ignore" });
    } catch {
      // Raycast may not be ready yet after fresh install
    }

    await ask(
      "\nPress Enter after you've added the script directory in Raycast...\nRaycast에서 스크립트 디렉토리를 추가한 후 Enter를 눌러주세요... "
    );
    console.log("   👍 Great! / 좋습니다!");
  }

  // Step 4: macOS accessibility reminder
  console.log("");
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│                                                              │");
  console.log("│  ⚙️  macOS Accessibility Permission Required                 │");
  console.log("│     macOS 손쉬운 사용 권한이 필요합니다                      │");
  console.log("│                                                              │");
  console.log("│  Voice Memos automation needs accessibility access.          │");
  console.log("│  음성 메모 자동화를 위해 접근성 권한이 필요합니다.           │");
  console.log("│                                                              │");
  console.log("│  1. Open System Settings                                     │");
  console.log("│     시스템 설정을 엽니다                                     │");
  console.log("│                                                              │");
  console.log("│  2. Privacy & Security → Accessibility                       │");
  console.log("│     개인정보 보호 및 보안 → 손쉬운 사용                      │");
  console.log("│                                                              │");
  if (installRaycast) {
    console.log("│  3. Toggle ON: Raycast                                       │");
    console.log("│     Raycast를 켜주세요                                       │");
    console.log("│                                                              │");
    console.log("│  4. Toggle ON: your terminal app (Terminal / iTerm2)         │");
    console.log("│     터미널 앱을 켜주세요 (Terminal / iTerm2)                 │");
  } else {
    console.log("│  3. Toggle ON: your terminal app (Terminal / iTerm2)         │");
    console.log("│     터미널 앱을 켜주세요 (Terminal / iTerm2)                 │");
  }
  console.log("│                                                              │");
  console.log("│  Without this, yapnotes cannot control Voice Memos.          │");
  console.log("│  이 권한이 없으면 음성 메모를 제어할 수 없습니다.            │");
  console.log("│                                                              │");
  console.log("└──────────────────────────────────────────────────────────────┘");

  console.log("");
  console.log("==========================================================");
  console.log("  ✅ yapnotes is ready! / yapnotes 설치 완료!");
  console.log("==========================================================");
  console.log("");
  console.log("  📋 Claude Code (paste any transcript / 전사문 직접 붙여넣기):");
  console.log('     /meeting-notes [title] [transcript text]');
  console.log("");
  if (installRaycast) {
    console.log("  🎙️  Raycast (full automation / 전체 자동화):");
    console.log('     1. "Record Meeting"         → Start recording / 녹음 시작');
    console.log("     2. Have your meeting...      회의를 진행하세요...");
    console.log('     3. "Finish Record Meeting"   → Auto-summarize / 자동 요약');
    console.log("");
    console.log("  📋 Raycast (clipboard / 클립보드):");
    console.log('     Copy text → "Summarize Transcript" → Done!');
    console.log("     텍스트 복사 → \"Summarize Transcript\" 실행 → 끝!");
    console.log("");
  }
  console.log(`  📁 Summaries saved to / 요약 저장 위치: ${outputDir}`);
  console.log("");
  console.log("  Happy yapping! 🎉");
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error("Setup error:", err.message);
  rl.close();
  process.exit(1);
});
