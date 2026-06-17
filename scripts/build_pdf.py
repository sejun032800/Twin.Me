#!/usr/bin/env python3
"""
Twin.me 웹 검수 PDF 빌더
스크린샷 5장을 모바일 스토리보드 레이아웃으로 합쳐 PDF 생성
"""
import json
import os
import sys
from pathlib import Path

try:
    import img2pdf
except ImportError:
    print("img2pdf not found, installing...")
    os.system("pip3 install img2pdf --quiet")
    import img2pdf

ROOT = Path(__file__).parent.parent
SHOTS_JSON = ROOT / "tmp_shots.json"
OUTPUT_PDF = ROOT / "Twin.me_2.0_사지방_완공검수_리포트.pdf"

def main():
    if not SHOTS_JSON.exists():
        print(f"❌ {SHOTS_JSON} not found — run capture_screenshots.mjs first")
        sys.exit(1)

    with open(SHOTS_JSON) as f:
        shots = json.load(f)

    image_files = []
    for shot in shots:
        fp = shot["file"]
        if os.path.exists(fp):
            image_files.append(fp)
            print(f"  ✅ {shot['label']} → {fp}")
        else:
            print(f"  ⚠️  Missing: {fp}")

    if not image_files:
        print("❌ No images found!")
        sys.exit(1)

    print(f"\n📄 PDF 생성 중... ({len(image_files)}장)")

    # img2pdf: A4 세로에 맞게 각 이미지를 한 페이지씩 배치
    # 각 이미지는 iPhone 14 해상도(393×852 @2x = 786×1704px)
    with open(OUTPUT_PDF, "wb") as f:
        f.write(img2pdf.convert(image_files))

    size_kb = OUTPUT_PDF.stat().st_size // 1024
    print(f"\n🎉 PDF 파일 생성 완료!")
    print(f"📁 절대 경로: {OUTPUT_PDF.absolute()}")
    print(f"📊 파일 크기: {size_kb:,} KB")
    print(f"📄 페이지 수: {len(image_files)}장")

if __name__ == "__main__":
    main()
