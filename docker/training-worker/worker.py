"""
MerryNote Training Data Worker
- Kafka 'training.sync' 토픽 구독
- 회의록 생성/편집 이벤트 → SFT/DPO JSONL 변환 → HF Dataset push
"""

import json
import os
import time
import logging
import base64
from datetime import datetime

from kafka import KafkaConsumer
from huggingface_hub import HfApi

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("training-worker")

# ── 환경변수 ──────────────────────────────────────────────────────────────────
KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "localhost:9092")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
HF_DATASET_REPO = os.environ.get("HF_DATASET_REPO", "boramintheMYSC/merrynote-training-data")
TOPIC = "training.sync"

SYSTEM_PROMPT = """You are a meeting notes assistant for MYSC (임팩트 투자 회사).
Your goal is to faithfully capture WHO said WHAT and HOW the conversation unfolded.
Output in Korean, using structured markdown format with speaker attributions."""

# ── HF API ────────────────────────────────────────────────────────────────────
hf_api = None
if HF_TOKEN:
    hf_api = HfApi(token=HF_TOKEN)
    log.info(f"HF Dataset: {HF_DATASET_REPO}")
else:
    log.warning("HF_TOKEN 미설정 — HF push 비활성화")

# ── 버퍼 (배치 push) ──────────────────────────────────────────────────────────
sft_buffer: list[dict] = []
dpo_buffer: list[dict] = []
FLUSH_INTERVAL = 60  # 60초마다 flush
FLUSH_SIZE = 5       # 5건 이상이면 즉시 flush
last_flush = time.time()


def make_sft_row(title: str, transcript: str, content: str) -> dict | None:
    """SFT 학습 데이터 행 생성"""
    if not transcript or len(content) < 500:
        return None
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Title: {title}\n\n## Transcript\n{transcript}"},
            {"role": "assistant", "content": content},
        ]
    }


def make_dpo_row(title: str, transcript: str, chosen: str, rejected: str, source: str) -> dict | None:
    """DPO 학습 데이터 행 생성"""
    if not transcript or chosen == rejected:
        return None
    prompt = json.dumps([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Title: {title}\n\n## Transcript\n{transcript}"},
    ], ensure_ascii=False)
    return {
        "prompt": prompt,
        "chosen": chosen,
        "rejected": rejected,
        "metadata": {"source": source},
    }


def process_message(msg):
    """단일 Kafka 메시지 처리"""
    data = json.loads(msg.value)
    msg_type = data.get("type", "unknown")
    note_id = data.get("noteId", "unknown")

    log.info(f"이벤트: {msg_type} (note: {note_id})")

    title = data.get("title", "회의록")
    content = data.get("content", "")
    transcript = data.get("transcript", "")
    generated = data.get("generatedContent", "")

    if msg_type == "note_created":
        # SFT: transcript → content
        sft = make_sft_row(title, transcript, content)
        if sft:
            sft_buffer.append(sft)
            log.info(f"  SFT 버퍼 추가 (총 {len(sft_buffer)}건)")

        # DPO: 편집된 경우
        if data.get("isEdited") and generated:
            dpo = make_dpo_row(title, transcript, content, generated, "initial_edit")
            if dpo:
                dpo_buffer.append(dpo)
                log.info(f"  DPO 버퍼 추가 — initial_edit (총 {len(dpo_buffer)}건)")

        # DPO: 재생성 이전 버전
        for prev in data.get("previousGenerations", []):
            if prev and prev != content and len(prev) > 200:
                dpo = make_dpo_row(title, transcript, content, prev, "regeneration")
                if dpo:
                    dpo_buffer.append(dpo)

    elif msg_type == "note_edited":
        prev_content = data.get("previousContent", "")

        # SFT: 최신 content로 업데이트
        sft = make_sft_row(title, transcript, content)
        if sft:
            sft_buffer.append(sft)

        # DPO: 이전 → 현재
        if prev_content and prev_content != content:
            dpo = make_dpo_row(title, transcript, content, prev_content, "post_save_edit")
            if dpo:
                dpo_buffer.append(dpo)
                log.info(f"  DPO 버퍼 추가 — post_save_edit (총 {len(dpo_buffer)}건)")

    maybe_flush()


def maybe_flush():
    """버퍼가 충분하거나 시간이 지나면 HF에 push"""
    global last_flush
    now = time.time()
    total = len(sft_buffer) + len(dpo_buffer)

    if total == 0:
        return
    if total < FLUSH_SIZE and (now - last_flush) < FLUSH_INTERVAL:
        return

    flush_to_hf()
    last_flush = now


def flush_to_hf():
    """버퍼의 데이터를 HF Dataset에 append"""
    global sft_buffer, dpo_buffer

    if not hf_api:
        log.warning("HF API 미설정 — flush 건너뜀")
        sft_buffer = []
        dpo_buffer = []
        return

    today = datetime.now().strftime("%Y-%m-%d %H:%M")

    try:
        if sft_buffer:
            # 기존 데이터 읽기 + append
            existing = _read_hf_file("sft/train.jsonl")
            new_lines = "\n".join(json.dumps(r, ensure_ascii=False) for r in sft_buffer)
            combined = (existing.rstrip("\n") + "\n" + new_lines + "\n").lstrip("\n")

            _write_hf_file("sft/train.jsonl", combined, f"SFT +{len(sft_buffer)}건 ({today})")
            log.info(f"HF push: SFT {len(sft_buffer)}건")
            sft_buffer = []

        if dpo_buffer:
            existing = _read_hf_file("dpo/train.jsonl")
            new_lines = "\n".join(json.dumps(r, ensure_ascii=False) for r in dpo_buffer)
            combined = (existing.rstrip("\n") + "\n" + new_lines + "\n").lstrip("\n")

            _write_hf_file("dpo/train.jsonl", combined, f"DPO +{len(dpo_buffer)}건 ({today})")
            log.info(f"HF push: DPO {len(dpo_buffer)}건")
            dpo_buffer = []

    except Exception as e:
        log.error(f"HF push 실패: {e}")


def _read_hf_file(path: str) -> str:
    """HF Dataset에서 파일 내용 읽기"""
    try:
        url = hf_api.hf_hub_url(repo_id=HF_DATASET_REPO, filename=path, repo_type="dataset")
        import httpx
        resp = httpx.get(url, headers={"Authorization": f"Bearer {HF_TOKEN}"}, follow_redirects=True)
        if resp.status_code == 200:
            return resp.text
    except Exception:
        pass
    return ""


def _write_hf_file(path: str, content: str, message: str):
    """HF Dataset에 파일 쓰기"""
    hf_api.upload_file(
        path_or_fileobj=content.encode("utf-8"),
        path_in_repo=path,
        repo_id=HF_DATASET_REPO,
        repo_type="dataset",
        commit_message=message,
    )


def main():
    log.info(f"Training Worker 시작 — Kafka: {KAFKA_BOOTSTRAP}")
    log.info(f"HF Dataset: {HF_DATASET_REPO}")

    consumer = None
    for attempt in range(30):
        try:
            consumer = KafkaConsumer(
                TOPIC,
                bootstrap_servers=KAFKA_BOOTSTRAP,
                group_id="merrynote-training",
                value_deserializer=lambda m: m,
                auto_offset_reset="earliest",
                enable_auto_commit=True,
                consumer_timeout_ms=10000,  # 10초 타임아웃 (flush용)
            )
            log.info(f"Kafka 연결 성공! 토픽 '{TOPIC}' 구독 중...")
            break
        except Exception as e:
            log.warning(f"Kafka 연결 대기 ({attempt + 1}/30): {e}")
            time.sleep(2)

    if not consumer:
        log.error("Kafka 연결 실패. 종료.")
        return

    # 메시지 처리 루프
    while True:
        try:
            for msg in consumer:
                try:
                    process_message(msg)
                except Exception as e:
                    log.error(f"메시지 처리 오류: {e}", exc_info=True)

            # consumer_timeout_ms 후 여기로 옴 — 시간 기반 flush
            maybe_flush()
        except Exception as e:
            log.error(f"Consumer 루프 오류: {e}", exc_info=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
