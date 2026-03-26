#!/usr/bin/env python3
"""파인튜닝된 Whisper 모델로 오디오를 전사한다.

transcribe.sh에서 subprocess로 호출됨.
stdout으로 전사 텍스트 출력, stderr로 상태 메시지.

Usage:
    python transcribe_finetuned.py --audio /tmp/yapnotes-xxx.wav \
                                   --model ~/.yapnotes/models/whisper-mysc
"""

import argparse
import sys
from pathlib import Path

import torch
import torchaudio
from transformers import WhisperProcessor, WhisperForConditionalGeneration
from peft import PeftModel


def transcribe(audio_path: str, model_path: str, base_model: str = "openai/whisper-large-v3"):
    model_dir = Path(model_path).expanduser()

    if not model_dir.exists():
        print(f"ERROR:FINETUNE: 모델 경로 없음 — {model_dir}", file=sys.stderr)
        sys.exit(1)

    # 디바이스
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"

    print(f"🎙️  파인튜닝 모델 로드 중... ({device})", file=sys.stderr)

    # 모델 로드
    processor = WhisperProcessor.from_pretrained(str(model_dir))
    model = WhisperForConditionalGeneration.from_pretrained(base_model)
    model = PeftModel.from_pretrained(model, str(model_dir))
    model = model.to(device)
    model.eval()

    # 오디오 로드
    waveform, sr = torchaudio.load(audio_path)
    if sr != 16000:
        waveform = torchaudio.functional.resample(waveform, sr, 16000)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # 30초 청크 처리
    samples = waveform.squeeze().numpy()
    chunk_size = 30 * 16000
    chunks = [samples[i:i + chunk_size] for i in range(0, len(samples), chunk_size)]

    forced_decoder_ids = processor.get_decoder_prompt_ids(language="ko", task="transcribe")

    results = []
    for i, chunk in enumerate(chunks):
        input_features = processor(
            chunk, sampling_rate=16000, return_tensors="pt"
        ).input_features.to(device)

        with torch.no_grad():
            predicted_ids = model.generate(
                input_features,
                forced_decoder_ids=forced_decoder_ids,
                max_new_tokens=448,
            )

        text = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
        results.append(text.strip())

        if len(chunks) > 1:
            print(f"  청크 {i + 1}/{len(chunks)} 완료", file=sys.stderr)

    print(" ".join(results))


def main():
    parser = argparse.ArgumentParser(description="파인튜닝 Whisper 전사")
    parser.add_argument("--audio", required=True, help="입력 오디오 파일 (wav)")
    parser.add_argument("--model", required=True, help="파인튜닝 모델 경로")
    parser.add_argument("--base-model", default="openai/whisper-large-v3")
    args = parser.parse_args()

    if not Path(args.audio).exists():
        print(f"ERROR:FINETUNE: 오디오 파일 없음 — {args.audio}", file=sys.stderr)
        sys.exit(1)

    transcribe(args.audio, args.model, args.base_model)


if __name__ == "__main__":
    main()
