"""
MerryNote Kafka Worker
- meeting.generate 토픽 구독
- Qwen(ollama) 호출로 회의록 생성
- Firestore에 저장
"""

import json
import os
import re
import time
import logging
from datetime import datetime

from kafka import KafkaConsumer
import openai
import firebase_admin
from firebase_admin import credentials, firestore

from prompts import SYSTEM_PROMPT, EXTRACT_STRUCTURED_PROMPT

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("worker")

# ── 환경변수 ──────────────────────────────────────────────────────
KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "localhost:9092")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL_NAME = os.environ.get("MODEL_NAME", "qwen3:8b")
TOPIC = "meeting.generate"

# ── Firebase 초기화 ────────────────────────────────────────────────
sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
if sa_json:
    cred = credentials.Certificate(json.loads(sa_json))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    log.info("Firebase 연결 완료")
else:
    db = None
    log.warning("FIREBASE_SERVICE_ACCOUNT 미설정 — Firestore 저장 비활성화")

# ── Qwen (ollama) 클라이언트 ────────────────────────────────────
llm = openai.OpenAI(base_url=f"{OLLAMA_URL}/v1", api_key="ollama")


def generate_notes(title: str, transcript: str, speaker_hint: str = "") -> str:
    """Qwen으로 회의록 생성"""
    today = datetime.now().strftime("%Y-%m-%d")
    user_content = f"Title: {title}\nDate: {today}\n"
    if speaker_hint:
        user_content += f"\n## 발화자 매핑 힌트\n{speaker_hint}\n"
    user_content += f"\n## Transcript\n{transcript}"

    log.info(f"Qwen 호출 시작 (모델: {MODEL_NAME}, 전사 {len(transcript)}자)")

    response = llm.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        max_tokens=8192,
        temperature=0.3,
    )

    content = response.choices[0].message.content or ""
    log.info(f"Qwen 응답 완료 ({len(content)}자)")
    return content


def extract_structured(content: str) -> dict | None:
    """회의록에서 결정사항/액션아이템/논의주제 추출"""
    try:
        prompt = EXTRACT_STRUCTURED_PROMPT.format(content=content[:6000])
        response = llm.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.1,
        )
        text = response.choices[0].message.content or ""
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group())
    except Exception as e:
        log.warning(f"구조화 추출 실패: {e}")
    return None


def save_to_firestore(job_id: str, title: str, content: str, transcript: str,
                      structured: dict | None, speaker_mappings: list | None):
    """Firestore에 회의록 저장 + job 상태 업데이트"""
    if not db:
        log.info(f"[DRY RUN] 회의록 저장: {title} ({len(content)}자)")
        return "dry-run-id"

    # 회의록 저장
    word_count = len(content.split())
    note_ref = db.collection("notes").add({
        "title": title,
        "content": content,
        "transcript": transcript,
        "wordCount": word_count,
        "structured": structured,
        "generatedBy": "qwen",
        "createdAt": firestore.SERVER_TIMESTAMP,
    })
    note_id = note_ref[1].id
    log.info(f"Firestore 저장 완료: notes/{note_id}")

    # job 상태 업데이트
    db.collection("jobs").document(job_id).update({
        "status": "done",
        "noteId": note_id,
        "completedAt": firestore.SERVER_TIMESTAMP,
    })

    return note_id


def process_message(msg):
    """단일 Kafka 메시지 처리"""
    data = json.loads(msg.value)
    job_id = data.get("jobId", "unknown")
    title = data.get("title", "회의록")
    transcript = data.get("transcript", "")
    speaker_mappings = data.get("speakerMappings", [])

    log.info(f"=== Job {job_id} 처리 시작: {title} ===")

    # job 상태 → processing
    if db:
        db.collection("jobs").document(job_id).update({"status": "processing"})

    # 발화자 힌트 구성
    speaker_hint = ""
    if speaker_mappings:
        lines = [f'- "{m["quote"][:60]}..." → {m["speaker"]}' for m in speaker_mappings if m.get("speaker")]
        if lines:
            speaker_hint = "\n".join(lines)

    # 회의록 생성
    content = generate_notes(title, transcript, speaker_hint)

    # 구조화 추출
    structured = extract_structured(content)

    # Firestore 저장
    note_id = save_to_firestore(job_id, title, content, transcript, structured, speaker_mappings)

    log.info(f"=== Job {job_id} 완료 → notes/{note_id} ===")


def main():
    log.info(f"Worker 시작 — Kafka: {KAFKA_BOOTSTRAP}, 모델: {MODEL_NAME}")
    log.info(f"Ollama URL: {OLLAMA_URL}")

    # Kafka 연결 대기 (시작 시 Kafka가 아직 안 떠있을 수 있음)
    consumer = None
    for attempt in range(30):
        try:
            consumer = KafkaConsumer(
                TOPIC,
                bootstrap_servers=KAFKA_BOOTSTRAP,
                group_id="merrynote-worker",
                value_deserializer=lambda m: m,
                auto_offset_reset="earliest",
                enable_auto_commit=True,
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
    for msg in consumer:
        try:
            process_message(msg)
        except Exception as e:
            log.error(f"메시지 처리 오류: {e}", exc_info=True)
            # job 상태 → error
            try:
                data = json.loads(msg.value)
                if db and "jobId" in data:
                    db.collection("jobs").document(data["jobId"]).update({
                        "status": "error",
                        "error": str(e),
                    })
            except Exception:
                pass


if __name__ == "__main__":
    main()
