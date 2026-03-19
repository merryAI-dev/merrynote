<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **yapnotes-web** (141 symbols, 248 relationships, 17 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/yapnotes-web/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/yapnotes-web/context` | Codebase overview, check index freshness |
| `gitnexus://repo/yapnotes-web/clusters` | All functional areas |
| `gitnexus://repo/yapnotes-web/processes` | All execution flows |
| `gitnexus://repo/yapnotes-web/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

---

## MerryNote 프로젝트 개요

Next.js 15 App Router + Firestore + Vercel Blob + Gemini 2.5 Flash + Claude API
MYSC 내부 회의록 자동 생성 서비스 (한국어, 소규모 팀)

## 완료된 Phase

- Phase 1: 내보내기 (Markdown 다운로드, 클립보드 복사, 인쇄)
- Phase 2: 단어장 후처리 (vocab/glossary + vocab/names → 전사 자동 교정)
- Phase 3: MediaRecorder + Gemini 재전사 옵션
- Phase 4: 구조화 추출 (decisions/actions/agenda → Haiku)
- Phase 5: 오디오 플레이어 + Slack 공유 버튼
- Basic Auth (mysc/mysc16858!!)
- Slack Bot (App ID: A0AMF0K3G5T, Bot Token: Vercel env)

## 화자 인식 로드맵 (2026 Q1~Q2)

### Phase 6 — 데이터 수집 인프라 (이번 주)
- speakerMap/speakerSegments Firestore 저장
- Gemini 전사 프롬프트에 화자분리 + 타임스탬프 요청
- 타임스탬프 파싱 → speakerSegments 저장
- 이전 회의 기반 화자 이름 자동 제안

### Phase 7 — 품질 강화 (1~2주 후)
- names.md ↔ Gemini 전사 프롬프트 자동 연동
- 화자 교정 피드백 자동 수집 (speakerCorrections)
- 단어장 자동 학습 (새 고유명사 감지 → vocab 추가 제안)

### Phase 8 — pyannote 파인튜닝 (2~3개월 후)
- RTTM export API
- RunPod pyannote 파인튜닝 → HuggingFace 배포
- HF Inference Endpoints 연동

### 핵심 원칙
- 매 회의의 수동 교정이 곧 학습 데이터 — **데이터는 절대 버리지 않는다**
- Firestore note 문서에 `speakerMap`, `speakerSegments`, `speakerCorrections` 필수 저장

## Firestore 데이터 구조

```
notes/{noteId}
  title, content, transcript, audioUrl, wordCount, durationMin
  embedding: number[] (768차원)
  structured: { decisions[], actions[], agenda[] }
  speakerMap: { "Speaker 1": "보람" }           // Phase 6
  speakerSegments: [{ start, end, speaker, text }]  // Phase 6
  speakerCorrections: [{ from, to, correctedAt }]   // Phase 7
  createdAt: timestamp

vocab/glossary: { content, updatedAt }
vocab/names: { content, updatedAt }
```