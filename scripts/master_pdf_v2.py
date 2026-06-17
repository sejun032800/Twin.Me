#!/usr/bin/env python3
"""
Twin.me 2.0 전기능 인터랙션 완벽검수 — 마스터 PDF 빌더 v2
캡션은 이미 Playwright HTML 렌더러가 적용 완료 → 순수 이미지 → PDF 변환만 수행
"""
import json, os, sys
from pathlib import Path
import img2pdf

ROOT     = Path(__file__).parent.parent
MANIFEST = ROOT / "master_manifest_v2.json"
OUTPUT   = ROOT / "Twin.me_2.0_전기능_인터랙션_완벽검수_마스터_v2.pdf"

def main():
    if not MANIFEST.exists():
        print(f"❌ {MANIFEST} not found")
        print("   먼저 node scripts/master_capture_v2.mjs 를 실행하세요")
        sys.exit(1)

    with open(MANIFEST, encoding='utf-8') as f:
        manifest = json.load(f)

    print(f"\n📄 PDF 통합 시작 — {len(manifest)}컷\n")

    captioned_files = []
    for entry in manifest:
        fp = entry.get('captionedFile')
        if not fp or not os.path.exists(fp):
            print(f"  ⚠️  Missing captioned file: {fp}")
            # fallback to raw
            raw = entry.get('rawFile', '')
            if raw and os.path.exists(raw):
                captioned_files.append(raw)
                print(f"       → rawFile 폴백 사용: {raw}")
            continue
        captioned_files.append(fp)
        caption = entry.get('caption', '?')[:55]
        idx     = entry.get('cutIndex', '?')
        print(f"  ✅ [{str(idx).zfill(2)}] {caption}")

    if not captioned_files:
        print("❌ 결합할 이미지가 없습니다!")
        sys.exit(1)

    print(f"\n🔗 img2pdf 변환 중... ({len(captioned_files)}장)")
    with open(OUTPUT, 'wb') as f:
        f.write(img2pdf.convert(captioned_files))

    size_kb = OUTPUT.stat().st_size // 1024
    print(f"\n{'═' * 60}")
    print(f"🎉 PDF 파일 생성 완료!")
    print(f"📁 절대 경로: {OUTPUT.absolute()}")
    print(f"📊 파일 크기: {size_kb:,} KB")
    print(f"📄 총 컷 수:  {len(captioned_files)}컷")
    print(f"{'═' * 60}\n")

if __name__ == '__main__':
    main()
