"""
MerryNote Whisper + pyannote 화자분리 서비스
- faster-whisper로 한국어 STT (word-level timestamps)
- pyannote 3.1로 화자분리
- 단어-화자 정렬 후 [MM:SS Speaker N] 포맷 출력
"""

import os
import json
import tempfile
import logging
from pathlib import Path

import subprocess

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("whisper-diarize")

# ── 환경변수 ──────────────────────────────────────────────────────────────────
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "medium")
DEVICE = os.environ.get("DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("COMPUTE_TYPE", "int8")
HF_TOKEN = os.environ.get("HF_TOKEN", "")

app = FastAPI(title="MerryNote Whisper+Diarize")

# ── 모델 로딩 (서버 시작 시 1회) ──────────────────────────────────────────────
whisper_model = None
diarize_pipeline = None


def load_models():
    global whisper_model, diarize_pipeline

    from faster_whisper import WhisperModel

    log.info(f"Whisper 모델 로딩: {WHISPER_MODEL} (device={DEVICE}, compute={COMPUTE_TYPE})")
    whisper_model = WhisperModel(WHISPER_MODEL, device=DEVICE, compute_type=COMPUTE_TYPE)
    log.info("Whisper 모델 로딩 완료")

    if HF_TOKEN:
        try:
            from pyannote.audio import Pipeline

            log.info("pyannote 화자분리 파이프라인 로딩...")
            # pyannote 4.x는 HF_TOKEN 환경변수에서 자동으로 토큰을 읽음
            diarize_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
            )
            if DEVICE == "cuda":
                import torch
                diarize_pipeline.to(torch.device("cuda"))
            log.info("pyannote 로딩 완료")
        except Exception as e:
            log.warning(f"pyannote 로딩 실패 (화자분리 없이 진행): {e}")
            diarize_pipeline = None
    else:
        log.warning("HF_TOKEN 미설정 — 화자분리 비활성화")


@app.on_event("startup")
async def startup():
    load_models()


# ── 오디오 전처리 ─────────────────────────────────────────────────────────────
def convert_to_wav(input_path: str, output_path: str):
    """ffmpeg로 WAV 16kHz mono 변환"""
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", output_path],
        capture_output=True, check=True,
    )


# ── 화자-단어 정렬 ────────────────────────────────────────────────────────────
def assign_speakers(segments_with_words, diarization):
    """pyannote 화자 세그먼트와 Whisper 단어를 정렬"""
    # pyannote 결과를 리스트로 변환
    diar_segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        diar_segments.append({
            "start": turn.start,
            "end": turn.end,
            "speaker": speaker,
        })

    # 각 Whisper 세그먼트에 화자 할당
    result = []
    for seg in segments_with_words:
        mid = (seg["start"] + seg["end"]) / 2
        speaker = "Speaker 0"
        for ds in diar_segments:
            if ds["start"] <= mid <= ds["end"]:
                speaker = ds["speaker"]
                break
        result.append({**seg, "speaker": speaker})

    return result


# ── 포맷팅 ────────────────────────────────────────────────────────────────────
def format_timestamp(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m:02d}:{s:02d}"


def build_output(speaker_segments):
    """[MM:SS Speaker N] 포맷 텍스트 + speakerSegments 배열 생성"""
    # pyannote speaker 라벨(SPEAKER_00 등)을 Speaker 1, 2로 정규화
    speaker_map = {}
    counter = 1

    grouped = []
    current = None

    for seg in speaker_segments:
        raw_speaker = seg.get("speaker", "Speaker 0")
        if raw_speaker not in speaker_map:
            speaker_map[raw_speaker] = f"Speaker {counter}"
            counter += 1
        speaker = speaker_map[raw_speaker]

        if current and current["speaker"] == speaker:
            # 같은 화자 연속 → 합침
            current["end"] = seg["end"]
            current["text"] += " " + seg["text"]
        else:
            if current:
                grouped.append(current)
            current = {
                "start": seg["start"],
                "end": seg["end"],
                "speaker": speaker,
                "text": seg["text"],
            }

    if current:
        grouped.append(current)

    # [MM:SS Speaker N] 포맷 텍스트
    lines = []
    for g in grouped:
        ts = format_timestamp(g["start"])
        lines.append(f"[{ts} {g['speaker']}] {g['text'].strip()}")

    text = "\n".join(lines)

    # speakerSegments 배열 (정수 초)
    segments = [
        {
            "start": round(g["start"], 1),
            "end": round(g["end"], 1),
            "speaker": g["speaker"],
            "text": g["text"].strip(),
        }
        for g in grouped
    ]

    return text, segments


# ── 메인 엔드포인트 ───────────────────────────────────────────────────────────
@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    participant_names: str = Form(default=""),
):
    if not whisper_model:
        return JSONResponse({"error": "모델이 로딩되지 않았습니다"}, status_code=503)

    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. 업로드 파일 저장
        input_path = os.path.join(tmpdir, file.filename or "audio.bin")
        with open(input_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # 2. WAV 16kHz mono 변환
        wav_path = os.path.join(tmpdir, "audio.wav")
        log.info(f"오디오 변환: {file.filename} ({len(content) / 1024 / 1024:.1f}MB)")
        convert_to_wav(input_path, wav_path)

        # 3. Whisper 전사 (word-level timestamps)
        log.info(f"Whisper 전사 시작 (모델: {WHISPER_MODEL})")
        segments_iter, info = whisper_model.transcribe(
            wav_path,
            language="ko",
            word_timestamps=True,
            vad_filter=True,
        )

        # 세그먼트를 리스트로 수집
        whisper_segments = []
        for segment in segments_iter:
            whisper_segments.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "words": [
                    {"start": w.start, "end": w.end, "word": w.word}
                    for w in (segment.words or [])
                ],
            })

        log.info(f"Whisper 전사 완료: {len(whisper_segments)}개 세그먼트, 언어={info.language}")

        # 4. pyannote 화자분리 (선택적)
        if diarize_pipeline:
            log.info("pyannote 화자분리 시작...")
            diarization = diarize_pipeline(wav_path)
            log.info(f"화자분리 완료: {len(list(diarization.itertracks()))}개 턴")

            # 5. 화자-세그먼트 정렬
            speaker_segments = assign_speakers(whisper_segments, diarization)
        else:
            # 화자분리 없이 단일 화자로 처리
            speaker_segments = [{**s, "speaker": "Speaker 0"} for s in whisper_segments]

        # 6. 출력 포맷팅
        text, segments = build_output(speaker_segments)

        log.info(f"처리 완료: {len(segments)}개 화자 세그먼트")

        return {
            "text": text,
            "speakerSegments": segments,
            "language": info.language,
            "duration": info.duration,
        }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "whisper_model": WHISPER_MODEL,
        "device": DEVICE,
        "diarization": diarize_pipeline is not None,
    }
