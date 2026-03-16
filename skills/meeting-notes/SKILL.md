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

### 3. Document Structure
Use the following structure as a base, adapting flexibly to fit the content:

```markdown
# [Title]

> 날짜: YYYY-MM-DD

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
4. **Term correction**: Fix speech-recognition errors using context clues (e.g., "엠에스에이" → MSA, "에이피아이" → API).
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
