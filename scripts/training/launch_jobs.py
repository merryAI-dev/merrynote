"""
HF Jobs로 SFT/DPO 학습 제출
GitHub Actions에서 호출: python scripts/training/launch_jobs.py --task sft|dpo
"""

import argparse
import os
import sys

try:
    from huggingface_hub import HfApi
except ImportError:
    print("pip install huggingface_hub 필요")
    sys.exit(1)

TOKEN = os.environ.get("HF_TOKEN")
if not TOKEN:
    print("HF_TOKEN 환경변수가 필요합니다.")
    sys.exit(1)

SCRIPTS = {
    "sft": {
        "script": "scripts/training/sft_train.py",
        "description": "MerryNote SFT 학습 (Qwen3-8B + LoRA)",
    },
    "dpo": {
        "script": "scripts/training/dpo_train.py",
        "description": "MerryNote DPO 학습 (SFT 모델 기반)",
    },
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", choices=["sft", "dpo"], required=True)
    parser.add_argument("--dry-run", action="store_true", help="실제 제출하지 않고 설정만 출력")
    args = parser.parse_args()

    task = SCRIPTS[args.task]
    print(f"학습 작업: {task['description']}")
    print(f"스크립트: {task['script']}")

    if args.dry_run:
        print("[DRY RUN] 실제 제출하지 않음")
        return

    api = HfApi(token=TOKEN)

    # HF Jobs로 학습 제출
    # 참고: HF Jobs API는 UV 스크립트 형태를 지원
    # 현재는 학습 스크립트를 수동으로 실행하는 방식으로 안내
    print(f"\n📋 HF Jobs 실행 방법:")
    print(f"   1. https://huggingface.co/spaces/huggingface/jobs 접속")
    print(f"   2. 'New Job' → 스크립트 업로드")
    print(f"   3. GPU: A10G, 최대 시간: 4h")
    print(f"   4. 환경변수: HF_TOKEN={TOKEN[:10]}...")
    print()
    print(f"   또는 CLI:")
    print(f"   huggingface-cli jobs run {task['script']} --gpu a10g --max-duration 4h")
    print()

    # TODO: HF Jobs API가 안정화되면 직접 API 호출로 전환
    # api.run_as_job(...)

    print("✅ 학습 안내 완료")


if __name__ == "__main__":
    main()
