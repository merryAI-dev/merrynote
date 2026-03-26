# MerryNote

> MerryNote — your meeting notes write themselves.
>
> 말만 하세요. 회의록은 알아서 써집니다.

Record meetings with macOS Voice Memos, automatically extract transcripts, and get beautifully structured summaries powered by Claude.

macOS 음성 메모 앱으로 회의를 녹음하고, 전사문을 자동으로 추출하여 Claude로 요약합니다.

No more frantic note-taking. No more "can you share the meeting notes?" Just talk.

## Requirements / 요구 사항

- **macOS Tahoe (26) or later** (Voice Memos transcript requires macOS Tahoe / 음성 메모 전사문은 macOS Tahoe부터 지원)
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** (for AI-powered summarization / AI 요약에 사용)
- **[Raycast](https://raycast.com)** (optional — works without it via Claude Code skill / 선택 사항)

## Installation / 설치

```bash
npx merrynote
```

Legacy alias: `npx yapnotes`

The interactive installer will: / 인터랙티브 설치가 진행됩니다:
1. Set your output directory / 요약 파일 저장 경로 설정
2. Install the Claude Code skill / Claude Code 스킬 설치
3. Optionally install Raycast (via Homebrew) + script commands / Raycast 설치(선택) + 스크립트 커맨드 설치

## Usage / 사용법

### Option 1: Raycast (fully automated / 전체 자동화)

| Command | Description / 설명 |
|---------|-------------|
| **Record Meeting** | Opens Voice Memos and starts recording / 음성 메모 앱 실행 + 녹음 시작 |
| **Finish Record Meeting** | Stops recording → extracts transcript → summarizes → saves .md / 녹음 종료 → 전사문 추출 → 요약 → MD 저장 |
| **Summarize Transcript** | Summarizes clipboard text with Claude / 클립보드 텍스트를 Claude로 요약 |
| **Set Meeting Output Path** | Change the output directory / 저장 경로 변경 |

**Typical workflow / 일반적인 워크플로우:**
1. Run `Record Meeting` — start your meeting / 녹음 시작
2. Have your meeting... / 회의를 진행하세요...
3. Run `Finish Record Meeting` — enter a title / 제목 입력
4. MerryNote handles the rest: stop → transcribe → summarize → open .md / 나머지는 자동: 종료 → 전사 → 요약 → 파일 열기

### Option 2: Claude Code skill (manual paste / 수동 붙여넣기)

Paste any transcript directly in Claude Code CLI: / Claude Code에서 직접 전사문을 붙여넣을 수 있습니다:

```
/meeting-notes Product Onboarding Meeting
[paste transcript text here / 전사문 텍스트 붙여넣기]
```

## macOS Setup / macOS 설정

Voice Memos automation requires accessibility permissions: / 음성 메모 자동화를 위해 접근성 권한이 필요합니다:

**System Settings > Privacy & Security > Accessibility**

**시스템 설정 > 개인정보 보호 및 보안 > 손쉬운 사용**

- If using Raycast: grant access to Raycast / Raycast 사용 시: Raycast에 권한 허용
- If using terminal: grant access to your terminal app / 터미널 사용 시: 터미널 앱에 권한 허용

## Output / 출력 예시

Files are saved as `YYYY-MM-DD-title.md`: / 파일은 `YYYY-MM-DD-제목.md` 형식으로 저장됩니다:

```markdown
# Product Onboarding Meeting

> Date: 2026-03-16

## Summary / 요약
- Key points in 2-4 sentences / 핵심 내용을 2~4문장으로 요약

---

## 1. Topic Section / 주제 섹션
- Organized by topic with logical flow / 주제별 논리적 흐름으로 정리
- **Key decisions** highlighted in bold / **핵심 결정 사항**은 볼드로 강조

## 2. Next Topic / 다음 주제
- ...

---

## Action Items / 액션 아이템
- [ ] Owner: task description / 담당자: 할 일

## Open Issues / 미결 사항
- Items requiring further discussion / 추가 논의가 필요한 사항
```

### Summarization Features / 요약 기능

- **Context-driven organization** — structures by topic, not just bullet points / 맥락 중심 구조화
- **Speech-to-text correction** — fixes common transcription errors / 음성 인식 오류 교정
- **Speaker attribution** — notes who said what when distinguishable / 발언자 구분
- **Smart formatting** — tables for comparisons, bold for key decisions / 표, 볼드 등 스마트 포매팅
- **Flexible sections** — adapts structure to fit the content / 내용에 맞게 섹션 유연 조정

## Author / 만든 사람

**Joshua Kim** ([@mingj7235](https://github.com/mingj7235)) — joshuara7235@gmail.com
