"""
Twinny UI Stylebook PDF Compiler
Generates high-quality PDF UI books for light and dark mode.
"""

import os
import sys
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
import io

# ── Register Korean CID fonts (built into reportlab) ──────────────────────────
pdfmetrics.registerFont(UnicodeCIDFont('HYGothic-Medium'))   # Korean Gothic (sans-serif)
pdfmetrics.registerFont(UnicodeCIDFont('HYSMyeongJo-Medium'))  # Korean Myeongjo (serif)

KR_REGULAR = 'HYGothic-Medium'
KR_BOLD    = 'HYGothic-Medium'   # use same face, rely on size for hierarchy

# ── Constants ──────────────────────────────────────────────────────────────────

SHOT_LABELS = {
    '01': ('1구간', '앱 스플래시 화면'),
    '02': ('1구간', '카카오톡 파일 업로드 온보딩'),
    '03': ('1구간', '파트너 매칭 단계'),
    '04': ('1구간', 'AI 채팅방 최초 진입'),
    '05': ('1구간', '분석가 룸 최초 진입'),
    '06': ('2구간 홈', 'DNA 점수 카드 + 메인 홈'),
    '07': ('2구간 홈', 'AI 코칭 카드 뷰'),
    '08': ('2구간 채팅', '채팅 메인 인터페이스'),
    '09': ('2구간 채팅', '주간 리포트 뷰'),
    '10': ('2구간 지도', '히스토리 지도 탭'),
    '11': ('2구간 지도', '코스 플래너 뷰'),
    '12': ('2구간 설정', 'AI 관리 센터 설정 화면'),
    '13': ('2구간 설정', '구독 플랜 프리미엄 CTA'),
    '14': ('2구간 설정', '소셜 계정 연동 화면'),
    '15': ('2구간 설정', '기억 삭제 섹션'),
}

SECTION_COLORS = {
    '1구간': '#7C3AED',
    '2구간 홈': '#D946EF',
    '2구간 채팅': '#FF6B8B',
    '2구간 지도': '#38BDF8',
    '2구간 설정': '#F59E0B',
}

PAGE_W, PAGE_H = A4  # 595.27 x 841.89 pt
MARGIN = 15 * mm

# Phone frame dimensions (iPhone 14 aspect: 390×844)
PHONE_ASPECT = 844 / 390
PHONE_W = (PAGE_W - 2 * MARGIN) / 2 - 8 * mm  # 2 columns
PHONE_H = PHONE_W * PHONE_ASPECT

# Grid: 2 columns × dynamic rows
COL_GAP = 8 * mm
ROW_GAP = 18 * mm  # space for label below
COL_W = PHONE_W
GRID_TOP = PAGE_H - 55 * mm  # below header


def draw_phone_frame(c, x, y, w, h, img_path, label, section, shot_id, mode):
    """Draw a phone mockup with screenshot inside."""
    FRAME_RADIUS = 18
    FRAME_COLOR = HexColor('#1E293B') if mode == 'dark' else HexColor('#E2E8F0')
    INNER_RADIUS = 14

    # Shadow
    c.saveState()
    c.setFillColor(HexColor('#00000033'))
    c.roundRect(x + 3, y - 3, w, h, FRAME_RADIUS, fill=1, stroke=0)
    c.restoreState()

    # Phone outer frame
    c.saveState()
    c.setFillColor(FRAME_COLOR)
    c.roundRect(x, y, w, h, FRAME_RADIUS, fill=1, stroke=0)
    c.restoreState()

    # Screen inset (2px padding each side)
    PAD = 3
    screen_x = x + PAD
    screen_y = y + PAD
    screen_w = w - 2 * PAD
    screen_h = h - 2 * PAD

    # Clip + draw screenshot
    try:
        img = Image.open(img_path)
        img_w, img_h = img.size
        # Fit into screen area while preserving aspect
        scale = min(screen_w / img_w, screen_h / img_h)
        draw_w = img_w * scale
        draw_h = img_h * scale
        off_x = screen_x + (screen_w - draw_w) / 2
        off_y = screen_y + (screen_h - draw_h) / 2

        c.saveState()
        p = c.beginPath()
        p.roundRect(screen_x, screen_y, screen_w, screen_h, INNER_RADIUS)
        c.clipPath(p, stroke=0)
        c.drawImage(ImageReader(img_path), off_x, off_y, draw_w, draw_h)
        c.restoreState()
    except Exception as e:
        # Draw error placeholder
        c.saveState()
        c.setFillColor(HexColor('#334155'))
        c.roundRect(screen_x, screen_y, screen_w, screen_h, INNER_RADIUS, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont(KR_REGULAR, 8)
        c.drawCentredString(screen_x + screen_w / 2, screen_y + screen_h / 2, 'No image')
        c.restoreState()

    # Shot ID badge
    badge_size = 16
    badge_x = x + w - badge_size - 4
    badge_y = y + h - badge_size - 4
    BADGE_COLOR = HexColor(SECTION_COLORS.get(section, '#7C3AED'))
    c.saveState()
    c.setFillColor(BADGE_COLOR)
    c.circle(badge_x + badge_size / 2, badge_y + badge_size / 2, badge_size / 2, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(KR_BOLD, 7)
    c.drawCentredString(badge_x + badge_size / 2, badge_y + 4.5, shot_id)
    c.restoreState()

    # Label area below phone
    label_y = y - 12 * mm
    c.saveState()
    c.setFillColor(HexColor(SECTION_COLORS.get(section, '#7C3AED')))
    c.setFont(KR_BOLD, 6)
    section_text = f'▶ {section}'
    c.drawString(x, label_y + 5 * mm, section_text)
    c.setFillColor(HexColor('#0F172A') if mode == 'light' else HexColor('#F1F5F9'))
    c.setFont(KR_BOLD, 8)
    # Truncate label if too long
    max_chars = int(w / 4.5)
    display_label = label if len(label) <= max_chars else label[:max_chars - 1] + '…'
    c.drawString(x, label_y, display_label)
    c.restoreState()


def draw_cover_page(c, mode):
    """Draw the cover page."""
    IS_DARK = mode == 'dark'
    BG = HexColor('#0A0D1A') if IS_DARK else HexColor('#FAF8F5')
    TEXT_PRIMARY = HexColor('#F1F5F9') if IS_DARK else HexColor('#0F172A')
    TEXT_SECONDARY = HexColor('#94A3B8') if IS_DARK else HexColor('#64748B')
    ACCENT = HexColor('#7C3AED')
    ACCENT2 = HexColor('#D946EF')
    ACCENT3 = HexColor('#FF6B8B')

    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Gradient band at top
    band_h = 180
    c.saveState()
    c.setFillColor(ACCENT)
    c.rect(0, PAGE_H - band_h, PAGE_W, band_h, fill=1, stroke=0)
    # Overlay gradient dots
    for i, (cx, cy, r, col) in enumerate([
        (PAGE_W * 0.3, PAGE_H - band_h * 0.4, 60, '#D946EF40'),
        (PAGE_W * 0.7, PAGE_H - band_h * 0.6, 80, '#FF6B8B30'),
        (PAGE_W * 0.5, PAGE_H - band_h * 0.2, 40, '#38BDF820'),
    ]):
        c.setFillColor(HexColor(col))
        c.circle(cx, cy, r, fill=1, stroke=0)
    c.restoreState()

    # App name
    c.saveState()
    c.setFillColor(white)
    c.setFont(KR_BOLD, 36)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 75, 'Twinny')
    c.setFont(KR_REGULAR, 14)
    c.setFillColor(HexColor('#E1BEE7'))
    c.drawCentredString(PAGE_W / 2, PAGE_H - 100, '내가 없는 순간에도, 너를 가장 나답게 사랑할 또 하나의 나.')
    c.restoreState()

    # Title block
    title_y = PAGE_H - 230
    c.saveState()
    c.setFillColor(TEXT_PRIMARY)
    c.setFont(KR_BOLD, 22)
    MODE_KO = '다크 모드' if IS_DARK else '라이트 모드'
    c.drawCentredString(PAGE_W / 2, title_y, f'UI Stylebook — {MODE_KO}')
    c.setFont(KR_REGULAR, 11)
    c.setFillColor(TEXT_SECONDARY)
    c.drawCentredString(PAGE_W / 2, title_y - 20, 'Twinny App  ·  React Native (Expo)  ·  2026.06.20')
    c.restoreState()

    # Divider
    c.saveState()
    c.setStrokeColor(HexColor('#7C3AED'))
    c.setLineWidth(2)
    c.line(MARGIN * 2, title_y - 40, PAGE_W - MARGIN * 2, title_y - 40)
    c.restoreState()

    # Inspection checklist
    checks = [
        ('7-1', '라이트 모드 파스텔 그라데이션 + #2D1B5A 다크 바이올렛 가독성'),
        ('7-2', '11px 마이크로 폰트 + t.textMuted 토큰 명도 대비 검수'),
        ('5-2', 'DNAScoreCard tabular-nums 고정폭 + 커닝(-1) 처리'),
        ('5-4', '주간 리포트 모달 Best 모먼트 말풍선 그라디언트 동기화'),
        ('6-1', 'AI/분석가 룸 최초 진입 가상 웰컴 버블'),
        ('6-2', '코스 데이터 0개 시 롱프레스 가이드 오버레이'),
        ('6-3', '기억 삭제 섹션 클린 상태 CTA 카피'),
        ('5-5', '소셜 연동 다크 모드 Google #131314 배경 매핑'),
    ]
    check_y = title_y - 65
    c.saveState()
    c.setFont(KR_BOLD, 10)
    c.setFillColor(ACCENT)
    c.drawString(MARGIN * 2, check_y, '수술 검수 항목')
    check_y -= 18
    for code, desc in checks:
        c.setFillColor(ACCENT2)
        c.setFont(KR_BOLD, 8)
        c.drawString(MARGIN * 2, check_y, f'[{code}]')
        c.setFillColor(TEXT_PRIMARY)
        c.setFont(KR_REGULAR, 8)
        c.drawString(MARGIN * 2 + 28, check_y, desc)
        check_y -= 14
    c.restoreState()

    # Shot index
    index_y = check_y - 20
    c.saveState()
    c.setFont(KR_BOLD, 10)
    c.setFillColor(ACCENT)
    c.drawString(MARGIN * 2, index_y, '컷 리스트 (총 15장)')
    index_y -= 18
    sections = {}
    for shot_id, (section, label) in SHOT_LABELS.items():
        sections.setdefault(section, []).append((shot_id, label))
    for section, shots in sections.items():
        c.setFillColor(HexColor(SECTION_COLORS.get(section, '#7C3AED')))
        c.setFont(KR_BOLD, 8)
        c.drawString(MARGIN * 2, index_y, f'◆ {section}')
        index_y -= 13
        for shot_id, label in shots:
            c.setFillColor(TEXT_SECONDARY)
            c.setFont(KR_REGULAR, 7.5)
            c.drawString(MARGIN * 2 + 12, index_y, f'Shot {shot_id}  {label}')
            index_y -= 11
        index_y -= 4

    c.restoreState()

    # Footer
    c.saveState()
    c.setFont(KR_REGULAR, 8)
    c.setFillColor(TEXT_SECONDARY)
    c.drawCentredString(PAGE_W / 2, 20, 'CONFIDENTIAL  ·  Twinny 2.0 Internal Design Review')
    c.restoreState()


def build_pdf(mode, screenshot_dir, output_path):
    """Build a PDF for the given mode."""
    IS_DARK = mode == 'dark'
    BG = HexColor('#0A0D1A') if IS_DARK else HexColor('#FAF8F5')
    TEXT_PRIMARY = HexColor('#F1F5F9') if IS_DARK else HexColor('#0F172A')
    TEXT_SECONDARY = HexColor('#94A3B8') if IS_DARK else HexColor('#64748B')
    ACCENT = HexColor('#7C3AED')

    c = pdf_canvas.Canvas(output_path, pagesize=A4)
    c.setTitle(f'Twinny UI Stylebook — {"다크 모드" if IS_DARK else "라이트 모드"}')
    c.setAuthor('Twinny Team')
    c.setSubject('UI Screen Captures 2026.06.20')

    # ── Cover Page ──────────────────────────────────────────────────────────────
    draw_cover_page(c, mode)
    c.showPage()

    # ── Screenshot Pages (3 per page: 3 rows × 2 cols is too narrow, so 2 cols × 3 rows) ──
    # Layout: 2 columns, 3 rows per page → 6 shots per page → 3 pages for 15 shots
    COLS = 2
    ROWS = 3
    SHOTS_PER_PAGE = COLS * ROWS

    # Recalculate phone size for 3-row layout
    usable_h = PAGE_H - 2 * MARGIN - 45 * mm  # header area
    ph_h = (usable_h - (ROWS - 1) * ROW_GAP) / ROWS
    ph_w = ph_h / PHONE_ASPECT
    if ph_w * COLS + COL_GAP > PAGE_W - 2 * MARGIN:
        ph_w = (PAGE_W - 2 * MARGIN - COL_GAP) / COLS
        ph_h = ph_w * PHONE_ASPECT

    shot_ids = sorted(SHOT_LABELS.keys())
    pages = [shot_ids[i:i+SHOTS_PER_PAGE] for i in range(0, len(shot_ids), SHOTS_PER_PAGE)]

    for page_idx, page_shots in enumerate(pages):
        # Page background
        c.setFillColor(BG)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

        # Header bar
        c.setFillColor(ACCENT)
        c.rect(0, PAGE_H - 22 * mm, PAGE_W, 22 * mm, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont(KR_BOLD, 11)
        MODE_KO = '다크 모드' if IS_DARK else '라이트 모드'
        c.drawString(MARGIN, PAGE_H - 14 * mm, f'Twinny UI Stylebook  ·  {MODE_KO}')
        c.setFont(KR_REGULAR, 9)
        c.drawRightString(PAGE_W - MARGIN, PAGE_H - 14 * mm, f'Page {page_idx + 2}  /  {len(pages) + 1}')

        # Draw phones in grid
        for idx, shot_id in enumerate(page_shots):
            col = idx % COLS
            row = idx // COLS

            # Position from top-left of content area
            x = MARGIN + col * (ph_w + COL_GAP)
            # y is bottom-left of phone frame (PDF coords: y=0 at bottom)
            top_of_grid = PAGE_H - 22 * mm - MARGIN
            y = top_of_grid - (row + 1) * ph_h - row * ROW_GAP

            section, label = SHOT_LABELS[shot_id]

            # Find image path
            img_path = os.path.join(screenshot_dir, f'shot_{shot_id}_{mode}.png')
            if not os.path.exists(img_path):
                # Try fallback
                img_path = os.path.join(screenshot_dir, f'shot_{shot_id}_{mode}_fallback.png')

            draw_phone_frame(c, x, y, ph_w, ph_h, img_path, label, section, shot_id, mode)

        c.showPage()

    c.save()
    print(f'✅ Saved: {output_path}')


def main():
    base = '/workspaces/twin.me-react-native'
    light_dir = os.path.join(base, 'assets/screenshots/light')
    dark_dir  = os.path.join(base, 'assets/screenshots/dark')

    light_pdf = os.path.join(base, 'Twinny_UI_Light_Mode.pdf')
    dark_pdf  = os.path.join(base, 'Twinny_UI_Dark_Mode.pdf')

    print('Building Light Mode PDF...')
    build_pdf('light', light_dir, light_pdf)

    print('Building Dark Mode PDF...')
    build_pdf('dark', dark_dir, dark_pdf)

    # Verify
    for path in [light_pdf, dark_pdf]:
        size = os.path.getsize(path)
        print(f'  {os.path.basename(path)}: {size:,} bytes ({size//1024} KB)')


if __name__ == '__main__':
    main()
