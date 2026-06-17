#!/usr/bin/env python3
"""
Twin.me 2.0 — E2E 유저 여정 전체 구조 검수서 PDF 빌더
캡션은 Playwright HTML 렌더러가 이미 합성 완료 → img2pdf로 순서 결합만 수행
"""
import json, os, sys
from pathlib import Path
import img2pdf

ROOT     = Path(__file__).parent.parent
MANIFEST = ROOT / "e2e_manifest.json"
OUTPUT   = ROOT / "Twin.me_2.0_E2E_유저여정_전체구조_검수서.pdf"

def main():
    if not MANIFEST.exists():
        print(f"❌ {MANIFEST} not found")
        print("   먼저 node scripts/e2e_journey_capture.mjs 를 실행하세요")
        sys.exit(1)

    with open(MANIFEST, encoding='utf-8') as f:
        manifest = json.load(f)

    print(f"\n📄 PDF 통합 시작 — {len(manifest)}컷\n")

    pages = []
    for entry in manifest:
        cap_fp = entry.get('captionedFile', '')
        raw_fp = entry.get('rawFile', '')
        cap    = entry.get('caption', '?')[:55]
        i      = entry.get('idx', '?')

        if cap_fp and os.path.exists(cap_fp):
            pages.append(cap_fp)
            print(f"  ✅ [{str(i).zfill(2)}] {cap}")
        elif raw_fp and os.path.exists(raw_fp):
            pages.append(raw_fp)
            print(f"  ⚠️  [{str(i).zfill(2)}] rawFile 폴백: {cap}")
        else:
            print(f"  ❌ [{str(i).zfill(2)}] 파일 없음 — 건너뜀")

    if not pages:
        print("❌ 결합할 이미지가 없습니다!")
        sys.exit(1)

    print(f"\n🔗 img2pdf 변환 중... ({len(pages)}장)")
    with open(OUTPUT, 'wb') as f:
        f.write(img2pdf.convert(pages))

    size_kb = OUTPUT.stat().st_size // 1024
    print(f"\n{'═' * 60}")
    print(f"🎉 PDF 최종 빌드 완료!")
    print(f"📁 절대 경로: {OUTPUT.absolute()}")
    print(f"📊 파일 크기: {size_kb:,} KB")
    print(f"📄 총 컷 수:  {len(pages)}컷")
    print(f"{'═' * 60}\n")

if __name__ == '__main__':
    main()
