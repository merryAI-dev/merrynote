#!/usr/bin/env python3
"""Claude 마크다운 회의록에서 순수 텍스트를 추출한다.

Usage:
    python extract_text.py summary.md              # 텍스트 출력
    python extract_text.py --dir ~/.merrynote/training-data  # 전체 변환
"""

import re
import sys
import json
import argparse
from pathlib import Path


def extract_transcript_from_markdown(md_text: str) -> str:
    """마크다운 문법을 제거하고 순수 텍스트만 추출."""
    lines = md_text.split("\n")
    content_lines = []
    for line in lines:
        stripped = line.strip()
        # 헤딩, 인용, 구분선, 체크박스 제거
        if re.match(r"^#{1,6}\s", stripped):
            continue
        if re.match(r"^>\s", stripped):
            continue
        if stripped == "---":
            continue
        if re.match(r"^-\s*\[\s*[xX ]?\s*\]", stripped):
            continue
        # 볼드/이탤릭 마크다운 제거 (내용은 유지)
        cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", stripped)
        cleaned = re.sub(r"\*(.*?)\*", r"\1", cleaned)
        # 불릿 제거
        cleaned = re.sub(r"^[-*]\s+", "", cleaned)
        # 표 구분선 제거
        if re.match(r"^\|[-:\s|]+\|$", cleaned):
            continue
        if cleaned:
            content_lines.append(cleaned)
    return " ".join(content_lines)


def process_training_data(data_dir: str):
    """training-data 디렉토리의 모든 summary를 텍스트로 변환."""
    data_path = Path(data_dir).expanduser()
    manifest_path = data_path / "manifest.jsonl"
    if not manifest_path.exists():
        print(f"manifest.jsonl 없음: {manifest_path}", file=sys.stderr)
        sys.exit(1)

    corrected_dir = data_path / "corrected"
    corrected_dir.mkdir(exist_ok=True)

    count = 0
    for line in manifest_path.read_text().strip().split("\n"):
        if not line.strip():
            continue
        entry = json.loads(line)
        summary_path = data_path / entry["summary"]
        if not summary_path.exists():
            continue
        md_text = summary_path.read_text()
        clean_text = extract_transcript_from_markdown(md_text)
        out_path = corrected_dir / f"{entry['id']}.txt"
        out_path.write_text(clean_text)
        count += 1

    print(f"{count}개 교정 텍스트 생성 → {corrected_dir}")


def main():
    parser = argparse.ArgumentParser(description="마크다운에서 순수 텍스트 추출")
    parser.add_argument("input", nargs="?", help="마크다운 파일 경로")
    parser.add_argument("--dir", help="training-data 디렉토리 일괄 변환")
    args = parser.parse_args()

    if args.dir:
        process_training_data(args.dir)
    elif args.input:
        text = Path(args.input).read_text()
        print(extract_transcript_from_markdown(text))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
