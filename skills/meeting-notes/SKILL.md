---
name: meeting-notes
description: Summarize and organize a transcript (meeting, lecture, interview, etc.) into a structured .md file. Use when the user provides a transcript or text to organize. User can specify the title.
disable-model-invocation: true
argument-hint: "[title] [transcript text]"
---

# Transcript Summarization Skill

When the user provides a transcript (meeting, lecture, interview, presentation, etc.), extract key information and organize it into a structured markdown document.

## Input

The user passes text via `$ARGUMENTS`. The first line or quoted phrase may be the title. If no clear title is given, infer one from the content. If `$ARGUMENTS` is empty or too short, ask the user to paste the transcript.

## Output Rules

### 1. Filename Convention
- Format: `YYYY-MM-DD-topic-keywords.md`
- Date: Use today's date unless the user specifies otherwise
- Topic: Use the user-specified title, or extract 2-4 core keywords from the content, joined by hyphens
- Korean is allowed in keywords
- Examples: `2026-03-11-도메인-제품-온보딩-1차.md`, `2026-03-15-결제-시스템-개선-논의.md`

### 2. Save Location
- Save to the current working directory

### 3. Response After Saving
- After saving, reply with **only one short line**: the saved filename. Nothing else.
- Example: `✅ 2026-03-18-재경팀-캐시플로-논의.md`
- Do NOT include file paths, summaries, or bullet points in the reply.

### 4. Document Structure
Use the following structure as a base, adapting flexibly to fit the content:

```markdown
# [Title]

> 날짜: YYYY-MM-DD
> 소요 시간: X분 (전사 기준)

## 요약
- 전체 내용을 2~4문장으로 핵심 요약

---

## 1. [Topic Section]
- Key points in logical flow
- Important context and background included

## 2. [Next Topic Section]
...

---

## 결정 사항
- Confirmed decisions (if any)

## 액션 아이템
- [ ] 담당자: 할 일 (if any)

## 미결 사항 / 추가 논의 필요
- Unresolved items (if any)
```

### 4. Core Principles

1. **Context-driven organization**: Don't just list points — understand the overall flow and structure logically by topic and narrative arc.
2. **Detailed yet accurate**: Include all important content without omission, but remove chatter, repetition, and fillers. When omitting non-essential content, verify that context is not damaged.
3. **Faithful to source**: Do not distort speakers' intent or nuance. Mark areas where inference was necessary.
4. **Term correction**: Fix speech-recognition errors using context clues AND the MYSC vocabulary below. When a spoken name (실명 or 별명) is garbled, correct it using the roster.
5. **Structurize**: Split into topic-based sections. Make cause-effect, comparisons, and relationships explicit.
6. **Bold emphasis**: Highlight key concepts, important numbers, and decisions with **bold**.
7. **Use tables**: Comparisons, classifications, and conditional handling are best presented as tables.
8. **Speaker attribution**: When distinguishable, note who said what.
9. **Decisions vs Open**: Clearly separate decided items from unresolved items.
10. **Use dividers**: Separate sections visually with `---` horizontal rules.
11. **Number sections**: Number each section for easy reference.

### 5. Section Flexibility
- Omit sections (결정 사항, 액션 아이템, 미결 사항) if they don't apply to the content.
- Add sections as needed based on the content's nature (e.g., Q&A, key takeaways, references).

## Execution Flow

1. If the user provides a title, use it. Otherwise infer from content.
2. Analyze the transcript to identify topics and key content.
3. Generate an appropriate filename (date + title/keywords).
4. Write the markdown document following the rules above.
5. Save the file and inform the user of the file path with a brief summary.

## Important

- The output document should be written in the **same language as the transcript** (typically Korean).
- This skill instruction is in English for token efficiency, but the output must match the input language.

---

## MYSC Vocabulary

### Organization Terms
- **MYSC** — 회사명. 음성 인식 오류 예: "밉스크", "엠와이에스씨" → MYSC
- **AX** — AI Transformation. 음성 인식 오류 예: "에이엑스", "에이 엑스" → AX
- **AXR** — AX 리서치팀. 음성 인식 오류 예: "에이엑스알" → AXR
- **임팩트투자** — MYSC 핵심 사업 영역
- **소셜벤처** — MYSC 투자/지원 대상

### Member Roster (실명 ↔ 별명)
When a name appears garbled or only a nickname is used, resolve using this table:

| 실명 | 별명 |
|------|------|
| 김정태 | 에이블 |
| 이예지 | 메씨리 |
| 김세은 | 람쥐 |
| 유자인 | 유자 |
| 나미소 | 쏘 |
| 박정호 | 스템 |
| 김선미 | 해니 |
| 이정선 | 보노 |
| 고인효 | 베리 |
| 하윤지 | 하모니 |
| 송영일 | 우슬 |
| 김영우 | 앵커 |
| 정지윤 | 유니 |
| 강신일 | 봄날 |
| 장란영 | 바닐라 |
| 김다은 | 데이나 |
| 이지현A | 리사 |
| 윤지수 | 이나 |
| 백지연 | 제리 |
| 송성미 | 도담 |
| 해민영 | 썬 |
| 한형규 | 데일리 |
| 송지효 | 송죠 |
| 장은희 | 나무 |
| 김빛고을 | 브이 |
| 이승연 | 뽀승 |
| 변준재 | 제이 |
| 하누리 | 주디 |
| 최종옥 | 가드너 |
| 김현지 | 데이지 |
| 민가람 | 담마 |
| 곽민주 | 노아 |
| 심지혜 | 쿠키 |
| 권혁준 | 준 |
| 김혜원 | 모토 |
| 최지윤 | 써니 |
| 김민주B | 만두 |
| 최유진 | 고야 |
| 서민종 | 파커 |
| 김혜령 | 테일러 |
| 김신영 | 가든 |
| 김준성 | 더준 |
| 신예진 | 진신 |
| 정지연 | 모모 |
| 강신혁 | 강케이 |
| 이준철 | 철쭉 |
| 이한선 | 안소니 |
| 이지현B | 올리브 |
| 박진영 | 그린 |
| 이현송 | 하모 |
| 김민선 | 포비 |
| 권상준 | 런던 |
| 최상배 | 루크 |
| 임종수 | 스티븐 |
| 박연주 | 연두 |
| 하송희 | 솔 |
| 현우정 | 로에 |
| 이동완 | 허브 |
| 김예빈 | 하얀 |
| 백민혁 | 혜윰 |
| 강민경 | 마고 |
| 강현주 | 헤일리 |
| 변민욱 | 보람 |
| 강혜진 | 트루 |
| 권혜연 | 호두 |
| 양인영 | 엠마 |
| 조이수 | 수 |
| 전우철 | 프코 |
| 김민주C | 코지 |
| 조아름 | 다온 |
| 백수미 | 포용 |
| 정재우 | 피터 |
| 현빈우 | 에리얼 |
| 고혜림 | 멜론 |
| 이시은 | 싱아 |
| 한연지 | 태중 |
| 김혜린 | 니아 |
| 방예원 | 숲 |
| 박지연 | 느티 |
| 이지영 | 이지 |
| 조정은 | 우디 |
| 김미연 | 메이 |

> **Usage rule**: In speaker attribution and action items, use whichever form appears more naturally in context (nickname preferred if that's what was spoken). Annotate as `별명(실명)` on first mention if both are identifiable — e.g., `에이블(김정태)`.

