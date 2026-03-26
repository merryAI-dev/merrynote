---
name: transcribe
description: Transcribe an audio file (M4A, MP3, WAV, etc.) using macOS built-in speech recognition, then generate structured meeting notes. Use when the user provides an audio file path.
argument-hint: "<오디오파일경로> [회의 제목]"
---

# Transcribe Audio Skill

The user wants to transcribe an audio file and turn it into meeting notes.

## Input

`$ARGUMENTS` contains:
- First token: file path to the audio file (m4a, mp3, wav, aiff, aac, mp4, mov)
- Rest (optional): meeting title

Example inputs:
- `~/Downloads/recording.m4a`
- `~/Downloads/recording.m4a 3월 AX 챔피언 미팅`
- `/Users/boram/Desktop/아이폰녹음.m4a`

## Steps

1. Parse the file path and optional title from `$ARGUMENTS`.
2. Run the transcription script:
   ```bash
   bash "<merrynote-root>/scripts/transcribe-m4a.sh" "<file-path>" "<title>"
   ```
3. The script outputs the transcript to stdout. Capture it.
4. If transcription succeeds, immediately invoke the meeting-notes logic:
   - Use the transcript as input
   - Use the provided title (or infer from content if none given)
   - Follow all rules from the meeting-notes skill (MYSC vocabulary, name mapping, etc.)
   - Save the structured .md file

## Error Handling

- If file not found: tell the user the path doesn't exist and ask them to check
- If permission denied for speech recognition: guide them to System Settings > Privacy > Speech Recognition
- If transcript is empty: suggest checking if the audio has speech content

## Important

- The transcription uses macOS built-in Korean speech recognition (SFSpeechRecognizer)
- Apply all MYSC vocabulary corrections (names, nicknames, org terms) to the transcript before generating notes
- Output the final meeting notes file path when done
- Find `merrynote-root` by going two levels up from this skill file's location
