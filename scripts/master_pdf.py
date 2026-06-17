#!/usr/bin/env python3
"""
Twin.me 2.0 전기능 인터랙션 완벽검수 — 마스터 PDF 빌더
각 스크린샷에 캡션 레이블을 추가하고 하나의 PDF로 통합
"""
import json, os, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import img2pdf

ROOT = Path(__file__).parent.parent
MANIFEST = ROOT / "master_manifest.json"
OUTPUT   = ROOT / "Twin.me_2.0_전기능_인터랙션_완벽검수_마스터.pdf"
CAPTIONED_DIR = ROOT / "captioned_cuts"

# ── 색상/폰트 설정 ────────────────────────────────────────────────────────────
BG_COLOR      = (10, 13, 26)       # Twin.me 딥다크 #0A0D1A
LABEL_BG      = (20, 20, 40, 220)  # 반투명 레이블 배경
CAPTION_COLOR = (255, 255, 255)    # 흰색 캡션
SCENARIO_COLOR= (180, 130, 238)    # 바이올렛 시나리오 이름 #B482EE
ACCENT_COLORS = {
    'S1': (244, 143, 177),   # 핑크 #F48FB1
    'S2': (129, 212, 250),   # 블루 #81D4FA
    'S3': (165, 214, 167),   # 그린 #A5D6A7
    'S4': (255, 204, 128),   # 오렌지 #FFCC80
}
CAPTION_BAR_H = 90   # 캡션 바 높이 (px, 1x)
FONT_SIZE_MAIN  = 22
FONT_SIZE_SUB   = 18

def find_font():
    """Try to find a CJK-compatible font."""
    candidates = [
        '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return None

def add_caption(img_path: str, caption: str, scenario: str, cut_num: int) -> str:
    """Add a caption bar to the bottom of a screenshot."""
    img = Image.open(img_path).convert('RGBA')
    W, H = img.size

    # Caption bar height scaled to image resolution
    bar_h = CAPTION_BAR_H * 2  # @2x

    # Create new image with caption bar
    new_h = H + bar_h
    canvas = Image.new('RGBA', (W, new_h), BG_COLOR + (255,))
    canvas.paste(img, (0, 0))

    # Draw caption bar background
    draw = ImageDraw.Draw(canvas)

    # Determine scenario color
    s_key = scenario.split()[0] if scenario else 'S1'
    accent = ACCENT_COLORS.get(s_key, (200, 200, 200))

    # Draw top accent line
    draw.rectangle([(0, H), (W, H + 6)], fill=accent + (255,))

    # Draw dark caption background
    draw.rectangle([(0, H + 6), (W, new_h)], fill=(14, 17, 32, 255))

    # Find font
    font_path = find_font()
    try:
        if font_path and font_path.endswith('.ttc'):
            font_main = ImageFont.truetype(font_path, FONT_SIZE_MAIN * 2)
            font_sub  = ImageFont.truetype(font_path, FONT_SIZE_SUB * 2)
        elif font_path:
            font_main = ImageFont.truetype(font_path, FONT_SIZE_MAIN * 2)
            font_sub  = ImageFont.truetype(font_path, FONT_SIZE_SUB * 2)
        else:
            font_main = ImageFont.load_default()
            font_sub  = ImageFont.load_default()
    except Exception:
        font_main = ImageFont.load_default()
        font_sub  = ImageFont.load_default()

    # Cut number badge
    badge_txt = f"#{cut_num:02d}"
    draw.rectangle([(16, H + 16), (80, H + 16 + 44)], fill=accent + (255,))
    draw.text((24, H + 18), badge_txt, fill=(10, 13, 26), font=font_main)

    # Caption text
    draw.text((96, H + 14), caption, fill=CAPTION_COLOR, font=font_main)

    # Scenario label (bottom right)
    s_label = f"[ {scenario} ]"
    bbox = draw.textbbox((0, 0), s_label, font=font_sub)
    s_w = bbox[2] - bbox[0]
    draw.text((W - s_w - 16, H + 50), s_label, fill=SCENARIO_COLOR, font=font_sub)

    # Convert back to RGB for saving
    result = canvas.convert('RGB')
    out_path = str(CAPTIONED_DIR / Path(img_path).name)
    result.save(out_path, 'PNG', quality=95)
    return out_path

def main():
    if not MANIFEST.exists():
        print(f"❌ {MANIFEST} not found")
        sys.exit(1)

    with open(MANIFEST) as f:
        manifest = json.load(f)

    CAPTIONED_DIR.mkdir(exist_ok=True)

    print(f"\n🎨 {len(manifest)}컷에 캡션 레이블 적용 중...\n")

    captioned_files = []
    for i, entry in enumerate(manifest, 1):
        fp = entry['file']
        caption = entry['caption']
        scenario = entry['scenario']

        if not os.path.exists(fp):
            print(f"  ⚠️  Missing: {fp}")
            continue

        out = add_caption(fp, caption, scenario, i)
        captioned_files.append(out)
        print(f"  ✅ [{i:02d}] {caption[:50]}")

    if not captioned_files:
        print("❌ No files to combine!")
        sys.exit(1)

    print(f"\n📄 PDF 통합 중... ({len(captioned_files)}장)")

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
