#!/usr/bin/env python3
"""whisper-large-v3 LoRA 파인튜닝 스크립트.

MYSC 회의 오디오 + 전사문 페어로 whisper 모델을 파인튜닝한다.
Apple Silicon (MPS) 호환. 증분 학습(resume) 지원.

Usage:
    python fine_tune.py --data-dir ~/.yapnotes/training-data \
                        --output-dir ~/.yapnotes/models/whisper-mysc \
                        --epochs 3 --resume

    # 교정된 텍스트 사용 (Claude 마크다운에서 추출)
    python fine_tune.py --data-dir ~/.yapnotes/training-data \
                        --output-dir ~/.yapnotes/models/whisper-mysc \
                        --use-corrected --epochs 3
"""

import argparse
import json
import sys
from pathlib import Path

import torch
import torchaudio
from datasets import Dataset, Audio
from transformers import (
    WhisperProcessor,
    WhisperForConditionalGeneration,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer,
)
from peft import LoraConfig, get_peft_model, TaskType


def detect_device():
    """사용 가능한 디바이스 감지."""
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_training_data(data_dir: str, use_corrected: bool = False):
    """manifest.jsonl에서 학습 데이터 로드."""
    data_path = Path(data_dir).expanduser()
    manifest = data_path / "manifest.jsonl"

    if not manifest.exists():
        print(f"Error: {manifest} 없음", file=sys.stderr)
        sys.exit(1)

    entries = []
    for line in manifest.read_text().strip().split("\n"):
        if not line.strip():
            continue
        entry = json.loads(line)
        audio_path = data_path / entry["audio"]
        if not audio_path.exists():
            continue

        # 텍스트 소스 결정
        if use_corrected:
            text_path = data_path / "corrected" / f"{entry['id']}.txt"
            if not text_path.exists():
                text_path = data_path / entry["transcript"]
        else:
            text_path = data_path / entry["transcript"]

        if not text_path.exists():
            continue

        entries.append({
            "audio": str(audio_path),
            "text": text_path.read_text().strip(),
        })

    if not entries:
        print("Error: 학습 데이터 없음. 회의를 몇 번 더 진행한 후 다시 시도하세요.", file=sys.stderr)
        sys.exit(1)

    print(f"📦 학습 데이터 {len(entries)}건 로드")
    return Dataset.from_list(entries).cast_column("audio", Audio(sampling_rate=16000))


def chunk_audio(dataset, processor, max_length_sec=30):
    """긴 오디오를 30초 청크로 분할하고 feature 추출."""

    def prepare_features(batch):
        audio = batch["audio"]
        # 30초 청크 분할
        samples = audio["array"]
        sr = audio["sampling_rate"]
        chunk_size = max_length_sec * sr

        if len(samples) <= chunk_size:
            chunks = [samples]
        else:
            chunks = [samples[i:i + chunk_size] for i in range(0, len(samples), chunk_size)]

        # 첫 번째 청크만 사용 (전체 텍스트와 매핑)
        # TODO: 타임스탬프 기반 텍스트 분할로 개선
        input_features = processor(
            chunks[0], sampling_rate=sr, return_tensors="pt"
        ).input_features[0]

        labels = processor.tokenizer(batch["text"]).input_ids

        return {"input_features": input_features, "labels": labels}

    return dataset.map(prepare_features, remove_columns=dataset.column_names)


def main():
    parser = argparse.ArgumentParser(description="Whisper LoRA 파인튜닝")
    parser.add_argument("--data-dir", required=True, help="학습 데이터 경로")
    parser.add_argument("--output-dir", required=True, help="모델 저장 경로")
    parser.add_argument("--base-model", default="openai/whisper-large-v3", help="베이스 모델")
    parser.add_argument("--epochs", type=int, default=3, help="학습 에폭")
    parser.add_argument("--batch-size", type=int, default=2, help="배치 크기")
    parser.add_argument("--lr", type=float, default=1e-4, help="학습률")
    parser.add_argument("--resume", action="store_true", help="이전 체크포인트에서 이어서 학습")
    parser.add_argument("--use-corrected", action="store_true", help="Claude 교정 텍스트 사용")
    parser.add_argument("--dry-run", action="store_true", help="데이터 로드만 확인")
    args = parser.parse_args()

    device = detect_device()
    print(f"🖥️  디바이스: {device}")

    # 데이터 로드
    dataset = load_training_data(args.data_dir, args.use_corrected)

    if args.dry_run:
        print(f"✅ Dry run 완료: {len(dataset)}건 데이터 확인")
        print(f"   첫 번째 샘플 텍스트: {dataset[0]['text'][:100]}...")
        return

    # 프로세서 & 모델 로드
    print(f"📥 모델 로드 중: {args.base_model}")
    processor = WhisperProcessor.from_pretrained(args.base_model)
    model = WhisperForConditionalGeneration.from_pretrained(args.base_model)

    # 한국어 설정
    model.generation_config.language = "ko"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None
    model.config.forced_decoder_ids = None

    # LoRA 적용
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.SEQ_2_SEQ_LM,
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    # 데이터 전처리
    print("🔧 데이터 전처리 중...")
    processed = chunk_audio(dataset, processor)

    # 학습 설정
    output_dir = Path(args.output_dir).expanduser()
    training_args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=max(1, 16 // args.batch_size),
        learning_rate=args.lr,
        num_train_epochs=args.epochs,
        fp16=False,
        bf16=False,
        dataloader_num_workers=0,
        save_strategy="epoch",
        logging_steps=10,
        predict_with_generate=True,
        generation_max_length=448,
        report_to="none",
        remove_unused_columns=False,
    )

    # 체크포인트 resume
    resume_checkpoint = None
    if args.resume and output_dir.exists():
        checkpoints = sorted(output_dir.glob("checkpoint-*"))
        if checkpoints:
            resume_checkpoint = str(checkpoints[-1])
            print(f"📌 체크포인트에서 이어서 학습: {resume_checkpoint}")

    # 학습
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=processed,
        processing_class=processor,
    )

    print(f"🚀 학습 시작 (에폭: {args.epochs}, 배치: {args.batch_size})")
    trainer.train(resume_from_checkpoint=resume_checkpoint)

    # LoRA 어댑터 저장
    model.save_pretrained(str(output_dir))
    processor.save_pretrained(str(output_dir))
    print(f"✅ 모델 저장: {output_dir}")
    print(f"   사용법: python transcribe_finetuned.py --audio <file> --model {output_dir}")


if __name__ == "__main__":
    main()
