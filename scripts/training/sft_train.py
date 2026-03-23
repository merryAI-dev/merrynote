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
MerryNote SFT 학습 — Qwen3-8B + LoRA
HF Jobs에서 실행: uv run sft_train.py

데이터: merryAI-dev/merrynote-training-data (sft/train.jsonl)
출력: merryAI-dev/merrynote-qwen3-8b-sft
"""

import os
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from trl import SFTTrainer, SFTConfig
from peft import LoraConfig

# ── 설정 ──────────────────────────────────────────────────────────────────────
MODEL_ID = os.environ.get("BASE_MODEL", "Qwen/Qwen3-8B")
DATASET_ID = os.environ.get("DATASET_ID", "merryAI-dev/merrynote-training-data")
OUTPUT_ID = os.environ.get("OUTPUT_MODEL", "merryAI-dev/merrynote-qwen3-8b-sft")
MAX_SEQ_LEN = 4096
NUM_EPOCHS = 3
LR = 2e-4
BATCH_SIZE = 4
GRAD_ACCUM = 4

print(f"모델: {MODEL_ID}")
print(f"데이터: {DATASET_ID}")
print(f"출력: {OUTPUT_ID}")

# ── 데이터 로드 ───────────────────────────────────────────────────────────────
dataset = load_dataset(DATASET_ID, data_files="sft/train.jsonl", split="train")
print(f"SFT 데이터: {len(dataset)}건")

if len(dataset) < 10:
    print("데이터가 10건 미만이라 학습을 건너뜁니다.")
    exit(0)

# ── 모델 로드 (4bit 양자화) ────────────────────────────────────────────────────
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="bfloat16",
    bnb_4bit_use_double_quant=True,
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)

if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# ── LoRA 설정 ─────────────────────────────────────────────────────────────────
lora_config = LoraConfig(
    r=64,
    lora_alpha=128,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    task_type="CAUSAL_LM",
)

# ── 데이터 양에 따라 하이퍼파라미터 조정 ──────────────────────────────────────
data_count = len(dataset)
if data_count < 50:
    NUM_EPOCHS = min(7, NUM_EPOCHS + 4)
    LR = 1e-4
    print(f"데이터 {data_count}건 — epochs={NUM_EPOCHS}, lr={LR}로 조정")

# ── 학습 ──────────────────────────────────────────────────────────────────────
training_args = SFTConfig(
    output_dir="./output-sft",
    num_train_epochs=NUM_EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUM,
    learning_rate=LR,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    bf16=True,
    logging_steps=5,
    save_strategy="epoch",
    max_seq_length=MAX_SEQ_LEN,
    weight_decay=0.01,
    push_to_hub=True,
    hub_model_id=OUTPUT_ID,
    hub_private_repo=True,
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    peft_config=lora_config,
    tokenizer=tokenizer,
    args=training_args,
)

print(f"\n학습 시작: {data_count}건, {NUM_EPOCHS} epochs, lr={LR}")
trainer.train()

# ── HF에 push ─────────────────────────────────────────────────────────────────
trainer.push_to_hub(commit_message=f"SFT 학습 완료 ({data_count}건, {NUM_EPOCHS}ep)")
print(f"\n✅ SFT 완료! 모델: https://huggingface.co/{OUTPUT_ID}")
