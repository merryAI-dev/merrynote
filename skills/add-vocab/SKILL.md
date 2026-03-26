---
name: add-vocab
description: Add a speech-recognition correction or custom term to the MYSC meeting-notes vocabulary. Use when the user reports a word that was mis-transcribed or mis-recognized.
argument-hint: "[잘못 인식된 표현] → [올바른 표현]  (예: 에이엑스팀 → AX팀)"
---

# Add Vocab Skill

The user wants to register a speech-recognition correction into the MYSC vocabulary so future meeting notes get it right.

## Input

`$ARGUMENTS` contains the correction in one of these formats:
- `에이엑스팀 → AX팀`
- `에이엑스팀 AX팀` (space-separated)
- `"에이엑스팀" should be "AX팀"`
- Free-form description like `에이엑스팀이 AX팀으로 나와야 해`

Parse the wrong form and correct form from whatever format is given.
If only one term is given with no correction, ask the user what it should be corrected to.

## What to do

1. Parse: extract `wrong_form` and `correct_form` from `$ARGUMENTS`.
2. Open the file `skills/meeting-notes/SKILL.md` (relative to the MerryNote install directory, which is the directory containing this skill file's parent `skills/` folder).
3. Find the line:
   ```
   ### Organization Terms
   ```
   Add a new bullet below the existing organization terms (before the blank line that precedes `### Member Roster`):
   ```
   - **{correct_form}** — 음성 인식 오류 예: "{wrong_form}" → {correct_form}
   ```
   If an entry for `correct_form` already exists, update its example list by appending `"{wrong_form}"` to the existing examples instead of duplicating the line.

4. Confirm to the user:
   > ✅ 추가했어! 앞으로 "{wrong_form}"은 "{correct_form}"으로 교정돼.

## Important
- Edit the actual file. Do not just show a diff.
- Keep the section structure of SKILL.md intact.
- The SKILL.md path is always: `[merrynote-root]/skills/meeting-notes/SKILL.md`
- Find merrynote-root by going two levels up from this skill file's location.
