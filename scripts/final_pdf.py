#!/usr/bin/env python3
"""Twin.me 2.0 — 최종 완공 검수서 PDF 빌더
출력 파일: Twin.me_2.0_전기능_E2E_유저여정_상세검수서.pdf
"""
import json, os, sys
from pathlib import Path
import img2pdf

ROOT     = Path(__file__).parent.parent
MANIFEST = ROOT / "final_manifest.json"
OUTPUT   = ROOT / "Twin.me_2.0_전기능_E2E_유저여정_상세검수서.pdf"

def main():
    if not MANIFEST.exists():
        print(f"❌ {MANIFEST} not found"); sys.exit(1)

    with open(MANIFEST, encoding='utf-8') as f:
        manifest = json.load(f)

    print(f"\n📄 Twin.me 2.0 최종 완공 검수서 PDF 빌드 — {len(manifest)}컷\n")
    pages = []
    for entry in manifest:
        cap_fp = entry.get('captionedFile', '')
        raw_fp = entry.get('rawFile', '')
        cap    = entry.get('caption', '?')[:60]
        i      = entry.get('idx', '?')
        if cap_fp and os.path.exists(cap_fp):
            pages.append(cap_fp); print(f"  ✅ [{str(i).zfill(2)}] {cap}")
        elif raw_fp and os.path.exists(raw_fp):
            pages.append(raw_fp); print(f"  ⚠️  [{str(i).zfill(2)}] raw 폴백: {cap}")
        else:
            print(f"  ❌ [{str(i).zfill(2)}] 파일 없음 — {cap}")

    if not pages:
        print("❌ 결합할 이미지 없음"); sys.exit(1)

    print(f"\n🔗 img2pdf 변환 중... ({len(pages)}장)")
    with open(OUTPUT, 'wb') as f:
        f.write(img2pdf.convert(pages))

    size_kb = OUTPUT.stat().st_size // 1024
    print(f"\n{'═' * 62}")
    print(f"🎉 PDF 최종 빌드 완료!")
    print(f"📁 절대 경로: {OUTPUT.absolute()}")
    print(f"📊 파일 크기: {size_kb:,} KB")
    print(f"📄 총 컷 수:  {len(pages)}컷")
    print(f"{'═' * 62}\n")

if __name__ == '__main__':
    main()
