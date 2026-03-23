# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "trl>=0.13",
#   "transformers>=4.47",
#   "peft>=0.14",
#   "datasets>=3.0",
#   "torch>=2.1",
#   "bitsandbytes>=0.44",
#   "accelerate>=1.0",
# ]
# ///
"""
MerryNote DPO 학습 — SFT 모델 기반 선호도 정렬
HF Jobs에서 실행: uv run dpo_train.py

데이터: merryAI-dev/merrynote-training-data (dpo/train.jsonl)
베이스: merryAI-dev/merrynote-qwen3-8b-sft (SFT 완료 모델)
출력: merryAI-dev/merrynote-qwen3-8b-dpo
"""

import json
import os
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from trl import DPOTrainer, DPOConfig
from peft import LoraConfig

# ── 설정 ──────────────────────────────────────────────────────────────────────
SFT_MODEL = os.environ.get("SFT_MODEL", "merryAI-dev/merrynote-qwen3-8b-sft")
DATASET_ID = os.environ.get("DATASET_ID", "merryAI-dev/merrynote-training-data")
OUTPUT_ID = os.environ.get("OUTPUT_MODEL", "merryAI-dev/merrynote-qwen3-8b-dpo")
BETA = 0.1
NUM_EPOCHS = 1
LR = 5e-5

print(f"SFT 모델: {SFT_MODEL}")
print(f"데이터: {DATASET_ID}")
print(f"출력: {OUTPUT_ID}")

# ── 데이터 로드 + 변환 ────────────────────────────────────────────────────────
raw = load_dataset(DATASET_ID, data_files="dpo/train.jsonl", split="train")
print(f"DPO 데이터: {len(raw)}건")

if len(raw) < 20:
    print("DPO 데이터가 20건 미만이라 학습을 건너뜁니다.")
    exit(0)

# prompt 필드가 JSON 문자열이므로 파싱해서 텍스트로 변환
def format_prompt(example):
    messages = json.loads(example["prompt"])
    text = ""
    for msg in messages:
        text += f"<|im_start|>{msg['role']}\n{msg['content']}<|im_end|>\n"
    text += "<|im_start|>assistant\n"
    return {"prompt": text}

dataset = raw.map(format_prompt)

# ── 모델 로드 ─────────────────────────────────────────────────────────────────
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="bfloat16",
)

tokenizer = AutoTokenizer.from_pretrained(SFT_MODEL, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    SFT_MODEL,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)

if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# ── LoRA 설정 ─────────────────────────────────────────────────────────────────
lora_config = LoraConfig(
    r=32,
    lora_alpha=64,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    task_type="CAUSAL_LM",
)

# ── DPO 학습 ──────────────────────────────────────────────────────────────────
training_args = DPOConfig(
    output_dir="./output-dpo",
    beta=BETA,
    num_train_epochs=NUM_EPOCHS,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    learning_rate=LR,
    bf16=True,
    logging_steps=5,
    save_strategy="epoch",
    max_prompt_length=2048,
    max_length=4096,
    push_to_hub=True,
    hub_model_id=OUTPUT_ID,
    hub_private_repo=True,
)

trainer = DPOTrainer(
    model=model,
    train_dataset=dataset,
    peft_config=lora_config,
    tokenizer=tokenizer,
    args=training_args,
)

print(f"\nDPO 학습 시작: {len(dataset)}건, beta={BETA}")
trainer.train()

trainer.push_to_hub(commit_message=f"DPO 학습 완료 ({len(dataset)}건, beta={BETA})")
print(f"\n✅ DPO 완료! 모델: https://huggingface.co/{OUTPUT_ID}")
