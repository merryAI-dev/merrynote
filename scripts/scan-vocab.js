#!/usr/bin/env node

/**
 * MYSC Vocab Scanner
 *
 * 지정한 로컬 폴더를 순회하며 텍스트 파일에서 고유명사 후보를 추출합니다.
 * 추출된 결과는 vocab/custom-terms.md 로 저장됩니다.
 *
 * Usage:
 *   node scripts/scan-vocab.js [폴더경로1] [폴더경로2] ...
 *
 * Example:
 *   node scripts/scan-vocab.js ~/Documents ~/Desktop/회의록
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ── 설정 ──────────────────────────────────────────────
const SUPPORTED_EXTENSIONS = [".md", ".txt", ".rtf", ".csv"];
const MAX_FILE_SIZE_MB = 5; // 5MB 초과 파일 스킵
const OUTPUT_PATH = path.join(__dirname, "../vocab/custom-terms.md");

// 한글 고유명사 후보 추출 패턴
// - 2~10자의 한글 단어 (조사 없이 단독 사용된 것)
// - 영문 대문자 약어 (2~8자)
// - 영문+한글 혼합 (예: AX팀, MYSC조직)
const KOREAN_WORD_PATTERN = /[가-힣]{2,10}/g;
const UPPERCASE_ABBR_PATTERN = /\b[A-Z][A-Z0-9]{1,7}\b/g;
const MIXED_PATTERN = /[A-Z][A-Za-z0-9]*[가-힣]+|[가-힣]+[A-Z][A-Za-z0-9]*/g;

// 흔한 일반 단어 필터 (불용어) - 이 단어들은 결과에서 제거
const STOPWORDS = new Set([
  "회의", "미팅", "오늘", "내일", "어제", "지금", "그래서", "그리고",
  "하지만", "때문", "그런데", "있어요", "합니다", "했습니다", "했어요",
  "아니라", "에서", "으로", "에게", "부터", "까지", "이후", "이전",
  "관련", "내용", "부분", "정도", "경우", "방법", "사항", "결과",
  "진행", "확인", "검토", "논의", "공유", "업데이트", "전달", "요청",
  "주간", "월간", "분기", "연간", "일정", "계획", "목표", "현황",
  "문서", "파일", "링크", "자료", "데이터", "정보", "보고",
]);

// ── 유틸 함수 ─────────────────────────────────────────
function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function collectFiles(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // .git, node_modules 등 스킵
        if (["node_modules", ".git", ".DS_Store", "__pycache__"].includes(entry.name)) continue;
        collectFiles(fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          const stat = fs.statSync(fullPath);
          if (stat.size <= MAX_FILE_SIZE_MB * 1024 * 1024) {
            files.push(fullPath);
          } else {
            console.log(`  ⚠️  스킵 (${MAX_FILE_SIZE_MB}MB 초과): ${fullPath}`);
          }
        }
      }
    }
  } catch (e) {
    console.log(`  ⚠️  접근 불가: ${dir}`);
  }
  return files;
}

function extractTerms(text) {
  const candidates = new Set();

  // 한글 단어
  const koreanMatches = text.match(KOREAN_WORD_PATTERN) || [];
  for (const w of koreanMatches) {
    if (!STOPWORDS.has(w)) candidates.add(w);
  }

  // 영문 대문자 약어
  const abbrMatches = text.match(UPPERCASE_ABBR_PATTERN) || [];
  for (const w of abbrMatches) {
    candidates.add(w);
  }

  // 혼합 표현
  const mixedMatches = text.match(MIXED_PATTERN) || [];
  for (const w of mixedMatches) {
    candidates.add(w);
  }

  return candidates;
}

// ── 메인 ──────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("❌ 스캔할 폴더를 지정해주세요.");
    console.error("   Usage: node scripts/scan-vocab.js [폴더경로1] [폴더경로2] ...");
    process.exit(1);
  }

  const targetDirs = args.map(expandHome);
  console.log("\n🔍 MYSC Vocab Scanner 시작\n");

  // 파일 수집
  let allFiles = [];
  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      console.log(`  ⚠️  존재하지 않는 경로: ${dir}`);
      continue;
    }
    console.log(`📂 스캔 중: ${dir}`);
    const files = collectFiles(dir);
    console.log(`   → ${files.length}개 파일 발견\n`);
    allFiles = allFiles.concat(files);
  }

  if (allFiles.length === 0) {
    console.log("❌ 스캔 가능한 파일이 없습니다.");
    process.exit(0);
  }

  console.log(`\n📄 총 ${allFiles.length}개 파일 분석 중...\n`);

  // 용어 빈도 집계
  const termFreq = new Map();

  for (const file of allFiles) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const terms = extractTerms(text);
      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
      }
      process.stdout.write(`\r  처리 중... ${allFiles.indexOf(file) + 1}/${allFiles.length}`);
    } catch (e) {
      // 인코딩 문제 등 스킵
    }
  }
  console.log("\n");

  // 빈도순 정렬 (2회 이상 등장한 것만)
  const sorted = [...termFreq.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a);

  // 카테고리 분리
  const koreanTerms = sorted.filter(([w]) => /^[가-힣]/.test(w));
  const abbrTerms = sorted.filter(([w]) => /^[A-Z]/.test(w));
  const mixedTerms = sorted.filter(([w]) => MIXED_PATTERN.test(w) && !/^[가-힣]/.test(w) && !/^[A-Z]/.test(w));

  // 결과 파일 생성
  const now = new Date().toISOString().split("T")[0];
  let output = `# MYSC 자동 추출 용어 후보\n`;
  output += `> 생성일: ${now} | 스캔 파일: ${allFiles.length}개 | 총 후보: ${sorted.length}개\n\n`;
  output += `⚠️  이 파일은 자동 생성된 후보 목록입니다. 직접 검토 후 불필요한 항목을 제거하고 \`vocab/glossary.md\`에 옮겨주세요.\n\n`;

  output += `---\n\n## 📌 영문 약어 / 조직명 후보\n`;
  output += `| 용어 | 빈도 | 설명 (직접 작성) |\n|------|------|------------------|\n`;
  for (const [term, count] of abbrTerms.slice(0, 100)) {
    output += `| ${term} | ${count} |  |\n`;
  }

  output += `\n---\n\n## 📌 한글 고유명사 후보\n`;
  output += `| 용어 | 빈도 | 설명 (직접 작성) |\n|------|------|------------------|\n`;
  for (const [term, count] of koreanTerms.slice(0, 200)) {
    output += `| ${term} | ${count} |  |\n`;
  }

  if (mixedTerms.length > 0) {
    output += `\n---\n\n## 📌 혼합 표현 후보\n`;
    output += `| 용어 | 빈도 | 설명 (직접 작성) |\n|------|------|------------------|\n`;
    for (const [term, count] of mixedTerms.slice(0, 50)) {
      output += `| ${term} | ${count} |  |\n`;
    }
  }

  output += `\n---\n\n## 다음 단계\n`;
  output += `1. 위 목록을 검토해서 실제 MYSC 고유 용어만 남기세요\n`;
  output += `2. 음성 인식 오류 패턴을 \`설명\` 열에 적어주세요 (예: "에이엑스" → AX)\n`;
  output += `3. \`vocab/glossary.md\`에 정리된 용어를 옮기면 SKILL.md에 자동 반영됩니다\n`;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output, "utf8");

  console.log(`✅ 완료!\n`);
  console.log(`   📊 발견된 후보 용어: ${sorted.length}개`);
  console.log(`   📁 저장 위치: ${OUTPUT_PATH}\n`);
  console.log(`다음 단계: custom-terms.md 를 열어서 실제 필요한 용어를 골라주세요!`);
}

main();
