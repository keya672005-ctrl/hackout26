# -*- coding: utf-8 -*-
"""
Build the HackOut'26 pitch deck as a real .pptx.

Everything here is a native PowerPoint object -- text frames, autoshapes and
freeform vector paths -- so a teammate can open it and edit any word or line.
No slide is a screenshot.

The palette is the product's own (frontend/src/index.css), flattened to solid
hex: PowerPoint has no backdrop-filter, so the glass panels become the colour
they resolve to over the dark ground rather than a translucency that would
render as a grey box.

Fonts are Georgia / Segoe UI / Consolas rather than the deck's Newsreader and
IBM Plex. A .pptx names one font per run with no fallback stack, so naming a
webfont would silently substitute on every machine that lacks it. These three
ship with both Windows and macOS.

Figures come from the live API and match the HTML deck slide for slide.
"""
import os

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# ----------------------------------------------------------------- palette
CANVAS   = RGBColor(0x05, 0x0E, 0x13)
PANEL    = RGBColor(0x0E, 0x1F, 0x26)
PANEL_HI = RGBColor(0x11, 0x2A, 0x30)
LINE     = RGBColor(0x1A, 0x3A, 0x38)
LINE_STR = RGBColor(0x21, 0x54, 0x4F)
TEAL     = RGBColor(0x2D, 0xD4, 0xBF)
VERIFIED = RGBColor(0x35, 0xDC, 0xB7)
REVIEW   = RGBColor(0xFB, 0xBF, 0x24)
SENSOR   = RGBColor(0x5A, 0xAE, 0xFF)
SATELLITE= RGBColor(0xFF, 0x91, 0x52)
INK      = RGBColor(0xEA, 0xF6, 0xF3)
INK2     = RGBColor(0xA7, 0xC3, 0xBE)
INK3     = RGBColor(0x7D, 0x9A, 0x95)

DISPLAY = "Georgia"
SANS    = "Segoe UI"
MONO    = "Consolas"

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


# ------------------------------------------------------------------ helpers
def new_slide():
    s = prs.slides.add_slide(BLANK)
    bg = s.background.fill
    bg.solid()
    bg.fore_color.rgb = CANVAS
    return s


def tb(slide, x, y, w, h, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    return tf


def para(tf, text, size=14, color=INK2, font=SANS, bold=False, italic=False,
         align=PP_ALIGN.LEFT, space_before=0, space_after=0, spacing=1.0,
         first=False, caps=False, char_space=None):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.space_before = Pt(space_before)
    p.space_after = Pt(space_after)
    p.line_spacing = spacing
    r = p.add_run()
    r.text = text.upper() if caps else text
    f = r.font
    f.size = Pt(size)
    f.color.rgb = color
    f.name = font
    f.bold = bold
    f.italic = italic
    if char_space is not None:
        # Letter-spacing has no python-pptx property; the attribute is `spc`
        # on the run's rPr, in hundredths of a point.
        r.font._rPr.set("spc", str(int(char_space * 100)))
    return p


def rich(tf, parts, size=14, color=INK2, font=SANS, align=PP_ALIGN.LEFT,
         spacing=1.22, space_before=0, first=False):
    """One paragraph, several runs -- so a figure can be bold mid-sentence."""
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.line_spacing = spacing
    p.space_before = Pt(space_before)
    for part in parts:
        text = part[0]
        opts = part[1] if len(part) > 1 else {}
        r = p.add_run()
        r.text = text
        r.font.size = Pt(opts.get("size", size))
        r.font.color.rgb = opts.get("color", color)
        r.font.name = opts.get("font", font)
        r.font.bold = opts.get("bold", False)
        r.font.italic = opts.get("italic", False)
    return p


def panel(slide, x, y, w, h, accent=False):
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Inches(h))
    sh.adjustments[0] = 0.025
    sh.fill.solid()
    sh.fill.fore_color.rgb = PANEL_HI if accent else PANEL
    sh.line.color.rgb = LINE_STR if accent else LINE
    sh.line.width = Pt(1)
    sh.shadow.inherit = False
    return sh


def rule(slide, x, y, w, color=LINE, width=1.0):
    ln = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Pt(width))
    ln.fill.solid()
    ln.fill.fore_color.rgb = color
    ln.line.fill.background()
    ln.shadow.inherit = False
    return ln


def badge(slide, x, y, text, ok=True):
    w = 1.28 if ok else 1.52
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Inches(0.28))
    sh.adjustments[0] = 0.22
    sh.fill.solid()
    sh.fill.fore_color.rgb = RGBColor(0x0D, 0x2B, 0x2B) if ok else RGBColor(0x2E, 0x26, 0x0E)
    sh.line.color.rgb = VERIFIED if ok else REVIEW
    sh.line.width = Pt(0.75)
    sh.shadow.inherit = False
    tf = sh.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    para(tf, text, size=10, color=VERIFIED if ok else REVIEW, bold=True,
         align=PP_ALIGN.CENTER, first=True)
    return sh


def eyebrow(slide, text, x=0.9, y=0.62):
    tf = tb(slide, x, y, 8.0, 0.3)
    para(tf, text, size=10.5, color=TEAL, bold=True, caps=True,
         char_space=1.6, first=True)


def heading(slide, text, x=0.9, y=1.02, w=9.2, h=1.5, size=34):
    tf = tb(slide, x, y, w, h)
    para(tf, text, size=size, color=INK, font=DISPLAY, spacing=1.1, first=True)


def bullets(tf, items, color=INK2, size=13.0, dash=TEAL, first_flag=True):
    """Marks list: an en-dash rule in the accent, then the line."""
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if (first_flag and i == 0) else tf.add_paragraph()
        p.line_spacing = 1.24
        p.space_after = Pt(7)
        r = p.add_run()
        r.text = "\u2014  "
        r.font.size = Pt(size)
        r.font.color.rgb = dash
        r.font.name = SANS
        for part in (item if isinstance(item, list) else [(item,)]):
            text = part[0]
            opts = part[1] if len(part) > 1 else {}
            rr = p.add_run()
            rr.text = text
            rr.font.size = Pt(opts.get("size", size))
            rr.font.color.rgb = opts.get("color", color)
            rr.font.name = opts.get("font", SANS)
            rr.font.bold = opts.get("bold", False)


def polyline(slide, pts_in, color, width=2.0, dashed=False):
    """A freeform vector path -- real editable geometry, not an image."""
    first = pts_in[0]
    builder = slide.shapes.build_freeform(Emu(int(Inches(first[0]))),
                                          Emu(int(Inches(first[1]))))
    builder.add_line_segments(
        [(Emu(int(Inches(x))), Emu(int(Inches(y)))) for x, y in pts_in[1:]],
        close=False)
    sh = builder.convert_to_shape()
    sh.fill.background()
    sh.line.color.rgb = color
    sh.line.width = Pt(width)
    sh.shadow.inherit = False
    if dashed:
        sh.line._get_or_add_ln().set("w", str(int(Pt(width))))
        from pptx.oxml.ns import qn
        ln = sh.line._get_or_add_ln()
        d = ln.makeelement(qn("a:prstDash"), {"val": "dash"})
        ln.append(d)
    return sh


def dot(slide, cx, cy, color, d=0.10):
    sh = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(cx - d / 2),
                                Inches(cy - d / 2), Inches(d), Inches(d))
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    sh.shadow.inherit = False
    return sh


def vline(slide, x, y1, y2, color=LINE_STR, width=1.25):
    ln = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y1),
                                Pt(width), Inches(y2 - y1))
    ln.fill.solid(); ln.fill.fore_color.rgb = color
    ln.line.fill.background(); ln.shadow.inherit = False


def hline(slide, x1, x2, y, color=LINE_STR, width=1.25):
    ln = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(min(x1, x2)),
                                Inches(y), Inches(abs(x2 - x1)), Pt(width))
    ln.fill.solid(); ln.fill.fore_color.rgb = color
    ln.line.fill.background(); ln.shadow.inherit = False


def arrowhead(slide, cx, cy, color=LINE_STR, size=0.11):
    sh = slide.shapes.add_shape(MSO_SHAPE.ISOSCELES_TRIANGLE,
                                Inches(cx - size / 2), Inches(cy - size),
                                Inches(size), Inches(size))
    sh.rotation = 180
    sh.fill.solid(); sh.fill.fore_color.rgb = color
    sh.line.fill.background(); sh.shadow.inherit = False


def footer(slide, n):
    # A progress track, not decoration: the fill runs n/10 of the way across,
    # so the bar says where in the deck you are. It sits ABOVE the caption --
    # the first pass drew it on the caption's baseline and struck the words out.
    TRACK = 11.53
    rule(slide, 0.9, 6.86, TRACK, color=LINE, width=1.5)
    rule(slide, 0.9, 6.86, TRACK * n / 10.0, color=TEAL, width=1.5)
    tf = tb(slide, 11.4, 7.00, 1.03, 0.3)
    para(tf, "%d / 10" % n, size=9.5, color=INK3, font=MONO,
         align=PP_ALIGN.RIGHT, first=True)
    tf2 = tb(slide, 0.9, 7.00, 6.0, 0.3)
    para(tf2, "BioFix  \u00b7  Pixel Error", size=9.5,
         color=INK3, font=MONO, first=True)


# =========================================================== 1. title
s = new_slide()
eyebrow(s, "HackOut\u201926  \u00b7  Circular Carbon Ecosystem", y=1.05)
tf = tb(s, 0.9, 1.42, 7.2, 2.0)
para(tf, "BioFix", size=66, color=INK, font=DISPLAY, spacing=1.0, first=True)
para(tf, "Algae-based carbon sequestration monitoring", size=15, color=INK3,
     spacing=1.2, space_before=12)
tf = tb(s, 0.9, 3.42, 6.1, 0.9)
para(tf, "We don\u2019t just show sensor numbers \u2014 we prove them.",
     size=20, color=INK, font=DISPLAY, italic=True, spacing=1.2, first=True)
tf = tb(s, 0.9, 4.42, 6.5, 1.4)
para(tf, "A verification layer for algae carbon credits: every reported figure "
         "is cross-checked against independent satellite imagery of the same "
         "pond, over the same days, before anyone calls it carbon.",
     size=13.5, color=INK2, spacing=1.34, first=True)
tf = tb(s, 0.9, 5.86, 6.5, 0.7)
para(tf, "Team Pixel Error  \u00b7  Adani University", size=11, color=INK3,
     font=MONO, first=True)
para(tf, "algae-carbon-platform.onrender.com", size=11, color=TEAL, font=MONO,
     space_before=3)

# the mark: two halves of one leaf, sampled from the same beziers as the deck
def bez(p0, p1, p2, p3, n=34):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]))
    return out

CX, CY, K = 10.55, 3.62, 1.95 / 192.0
def L(pt):
    return (CX + pt[0] * K, CY + pt[1] * K)

polyline(s, [L(p) for p in bez((0,-96), (-66,-52), (-66,52), (0,96))],
         SENSOR, width=3.0)
polyline(s, [L(p) for p in bez((0,-96), (66,-52), (66,52), (0,96))],
         SATELLITE, width=3.0, dashed=True)
vline(s, CX, CY - 96 * K, CY + 96 * K, color=LINE_STR, width=1.0)

tf = tb(s, 8.35, 5.05, 4.4, 1.0)
para(tf, "The mark is the argument. Solid half: the sensor record. Dashed half: "
         "the independent satellite proxy drawn against it. They close into a "
         "leaf only when the two agree.",
     size=10.5, color=INK3, align=PP_ALIGN.CENTER, spacing=1.3, first=True)
footer(s, 1)

# =========================================================== 2. problem
s = new_slide()
eyebrow(s, "The problem")
heading(s, "The seller owns the instrument,\nthe number, and the incentive.", w=9.6)
tf = tb(s, 0.9, 2.72, 5.7, 2.6)
para(tf, "Algae fixes CO\u2082 faster per hectare than forest, and carbon credits "
         "are issued against it. The figure that sets the price comes from "
         "sensors in the operator\u2019s own ponds, read by the operator\u2019s own "
         "software, and sent to a verifier as a spreadsheet.",
     size=14, color=INK2, spacing=1.36, first=True)
para(tf, "Nothing in that chain is independent. A pond that underperforms and a "
         "pond that is over-reported produce the same document, and a verifier "
         "holding it has no second source to separate them.",
     size=13, color=INK2, spacing=1.36, space_before=13)
panel(s, 7.2, 2.72, 5.24, 2.86, accent=True)
tf = tb(s, 7.52, 2.98, 4.6, 0.3)
para(tf, "What the buyer is actually trusting", size=10.5, color=INK3,
     bold=True, caps=True, char_space=1.1, first=True)
tf = tb(s, 7.52, 3.42, 4.6, 2.0)
bullets(tf, ["The hardware was calibrated, by the party being paid.",
             "The readings were not selectively dropped.",
             "The growth curve is biology, not a spreadsheet.",
             "The pond existed, at that size, on those dates."])
footer(s, 2)

# =========================================================== 3. gap
s = new_slide()
eyebrow(s, "The gap")
heading(s, "Measurement is not verification.")
panel(s, 0.9, 2.5, 5.5, 3.3)
tf = tb(s, 1.22, 2.78, 4.9, 0.3)
para(tf, "What a verifier receives today", size=10.5, color=INK3, bold=True,
     caps=True, char_space=1.1, first=True)
tf = tb(s, 1.22, 3.22, 4.9, 2.4)
bullets(tf, ["A time series of pond readings, supplied by the operator.",
             "A conversion constant applied to it.",
             "A single number, with no second measurement to test it against.",
             "A site visit, if the credit is large enough to justify a flight."],
        dash=LINE_STR)
panel(s, 6.94, 2.5, 5.5, 3.3, accent=True)
tf = tb(s, 7.26, 2.78, 4.9, 0.3)
para(tf, "What would actually settle it", size=10.5, color=INK3, bold=True,
     caps=True, char_space=1.1, first=True)
tf = tb(s, 7.26, 3.22, 4.9, 2.0)
bullets(tf, [[("A second measurement of ",), ("the same pond", {"bold": True, "color": INK}),
              (", over ",), ("the same days", {"bold": True, "color": INK}),
              (", from an instrument the operator does not own.",)],
             [("A stated rule for when the two disagree enough to matter.",)],
             [("A verdict a verifier can re-derive, not a dashboard to read.",)]])
tf = tb(s, 7.26, 5.16, 4.9, 0.6)
para(tf, "That second instrument already exists, is free, and photographs every "
         "pond on Earth every five days.",
     size=11, color=INK3, spacing=1.3, first=True)
footer(s, 3)

# =========================================================== 4. mechanism
s = new_slide()
eyebrow(s, "The mechanism")
heading(s, "Two records that share no input, compared by one rule.", w=8.5, size=29)

def box(x, y, w, h, title, sub, tcolor=INK, accent=False):
    sh = panel(s, x, y, w, h, accent=accent)
    if accent:
        sh.line.color.rgb = TEAL
    tf = tb(s, x, y + 0.14, w, 0.34)
    para(tf, title, size=12.5, color=tcolor, bold=True,
         align=PP_ALIGN.CENTER, font=MONO if accent else SANS, first=True)
    tf = tb(s, x, y + 0.46, w, 0.3)
    para(tf, sub, size=10, color=INK2 if accent else INK3,
         align=PP_ALIGN.CENTER, first=True)

box(2.30, 2.16, 3.30, 0.84, "Pond sensors", "hourly  \u00b7  simulated", SENSOR)
box(7.70, 2.16, 3.30, 0.84, "Sentinel-2", "real imagery  \u00b7  cached", SATELLITE)
box(2.30, 3.62, 3.30, 0.84, "CO\u2082 engine", "\u00d7 1.8321 kg CO\u2082 / kg")
box(7.70, 3.62, 3.30, 0.84, "Imagery index", "NDCI, per block per date")

for x in (3.95, 9.35):
    vline(s, x, 3.00, 3.50)
    arrowhead(s, x + 0.01, 3.60)
tf = tb(s, 4.06, 3.06, 1.9, 0.3)
para(tf, "biomass density", size=9.5, color=INK3, first=True)
tf = tb(s, 9.46, 3.06, 1.6, 0.3)
para(tf, "chlorophyll", size=9.5, color=INK3, first=True)

# converge on the comparator
vline(s, 3.95, 4.46, 4.82, color=TEAL); hline(s, 3.95, 5.95, 4.82, color=TEAL)
vline(s, 5.95, 4.82, 5.14, color=TEAL); arrowhead(s, 5.96, 5.24, color=TEAL)
vline(s, 9.35, 4.46, 4.82, color=TEAL); hline(s, 7.38, 9.35, 4.82, color=TEAL)
vline(s, 7.38, 4.82, 5.14, color=TEAL); arrowhead(s, 7.39, 5.24, color=TEAL)
tf = tb(s, 5.0, 4.50, 3.33, 0.3)
para(tf, "both normalised to 100 at day 0", size=9.5, color=TEAL,
     align=PP_ALIGN.CENTER, first=True)

box(5.02, 5.26, 3.30, 0.86, "RULE-001",
    "14-day rolling window  \u00b7  \u00b115%", TEAL, accent=True)

vline(s, 6.66, 6.12, 6.26); hline(s, 4.30, 9.02, 6.26)
vline(s, 4.30, 6.26, 6.35); arrowhead(s, 4.31, 6.46)
vline(s, 9.02, 6.26, 6.35); arrowhead(s, 9.03, 6.46)
badge(s, 3.66, 6.50, "Verified", ok=True)
badge(s, 8.26, 6.50, "Needs review", ok=False)
footer(s, 4)

# =========================================================== 5. charts
s = new_slide()
eyebrow(s, "In practice")
heading(s, "Same rule, same window, two different answers.", w=10.0, size=31)

tf = tb(s, 0.9, 2.22, 11.5, 0.3)
rich(tf, [("\u2014\u2014 ", {"color": SENSOR, "bold": True}),
          ("sensor-reported biomass       ", {"color": INK2}),
          ("- - - ", {"color": SATELLITE, "bold": True}),
          ("satellite chlorophyll index       ", {"color": INK2}),
          ("both indexed to 100  \u00b7  28 compared days",
           {"color": INK3, "font": MONO, "size": 11})],
     size=12, first=True)

A_SEN = [100.0,102.0,104.0,105.8,107.5,109.2,110.7,112.0,111.3,109.5,107.7,106.1,106.5,108.1,109.6,111.0,112.3,111.6,109.8,108.1,106.6,105.2,105.8,107.6,109.3,110.8,110.5,108.8]
A_SAT = [100.0,99.2,98.4,98.3,98.3,98.5,99.0,99.5,99.6,99.0,98.5,98.0,97.8,98.1,98.7,99.7,101.0,102.2,103.0,103.6,103.9,103.8,104.2,105.2,105.9,106.6,107.0,107.4]
B_SEN = [100.0,104.4,108.8,113.2,117.5,121.8,126.1,130.3,132.3,133.2,134.0,134.9,135.8,136.7,137.7,138.7,139.7,140.8,141.8,142.9,144.0,143.1,142.8,143.8,144.8,145.9,147.0,148.2]
B_SAT = [100.0,101.9,103.8,105.7,107.5,109.2,110.9,112.6,114.0,115.2,116.1,116.9,117.4,117.9,118.4,118.9,119.4,119.8,120.2,120.6,121.0,121.4,121.9,122.6,123.5,124.5,125.7,126.8]

VMIN, VMAX = 95.0, 150.0
PLOT_W, PLOT_H, PLOT_T = 4.62, 2.06, 3.30

def chart(ox, name, ok, sen, sat, note_runs, tail=False):
    tf = tb(s, ox, 2.72, 3.2, 0.36)
    para(tf, name, size=15, color=INK, font=DISPLAY, first=True)
    badge(s, ox + PLOT_W + 0.50 - (1.28 if ok else 1.52), 2.76,
          "Verified" if ok else "Needs review", ok=ok)

    px = ox + 0.50
    def X(i): return px + PLOT_W * i / (len(sen) - 1)
    def Y(v): return PLOT_T + PLOT_H * (1 - (v - VMIN) / (VMAX - VMIN))

    for gv in (100, 120, 140):
        hline(s, px, px + PLOT_W, Y(gv), color=LINE, width=0.75)
        t = tb(s, ox - 0.06, Y(gv) - 0.10, 0.52, 0.24)
        para(t, str(gv), size=9, color=INK3, font=MONO,
             align=PP_ALIGN.RIGHT, first=True)

    polyline(s, [(X(i), Y(v)) for i, v in enumerate(sat)], SATELLITE,
             width=1.75, dashed=True)
    polyline(s, [(X(i), Y(v)) for i, v in enumerate(sen)], SENSOR, width=2.25)
    if tail:
        vline(s, X(27), Y(sen[-1]), Y(sat[-1]), color=REVIEW, width=1.0)
    dot(s, X(27), Y(sen[-1]), SENSOR)
    dot(s, X(27), Y(sat[-1]), SATELLITE)

    t = tb(s, px, PLOT_T + PLOT_H + 0.08, PLOT_W, 0.24)
    para(t, "15 Aug", size=9, color=INK3, font=MONO, first=True)
    t = tb(s, px, PLOT_T + PLOT_H + 0.08, PLOT_W, 0.24)
    para(t, "11 Sep", size=9, color=INK3, font=MONO,
         align=PP_ALIGN.RIGHT, first=True)

    t = tb(s, ox, PLOT_T + PLOT_H + 0.46, PLOT_W + 0.5, 0.9)
    rich(t, note_runs, size=11.5, color=INK2, spacing=1.32, first=True)

chart(0.9, "Earthrise Block A", True, A_SEN, A_SAT,
      [("Peak divergence ",), ("+12.6%", {"font": MONO, "bold": True, "color": INK}),
       (" against a ",), ("15%", {"font": MONO, "bold": True, "color": INK}),
       (" tolerance, currently ",), ("+1.4%", {"font": MONO}),
       (". No sustained disagreement, so the figure is publishable.",)])

chart(7.06, "Cyanotech Block A", False, B_SEN, B_SAT,
      [("Reported biomass ran up to ",),
       ("+19.0%", {"font": MONO, "bold": True, "color": INK}),
       (" above the proxy and stayed outside tolerance for ",),
       ("21 consecutive days", {"font": MONO, "bold": True, "color": INK}),
       (" of the 28 compared. Flagged \u2014 not accused.",)], tail=True)
footer(s, 5)

# =========================================================== 6. coverage
s = new_slide()
eyebrow(s, "Coverage")
heading(s, "A facility does not fail verification. A pond does.", w=9.4, size=31)

ROWS = [("Earthrise Block A", "Calipatria, California", "45,624 kg", True),
        ("Earthrise Block B", "Calipatria, California", "38,593 kg", True),
        ("Earthrise Block C", "Calipatria, California", "38,037 kg", True),
        ("Cyanotech Block A", "Keahole Point, Hawaii", "15,770 kg", False),
        ("Cyanotech Block B", "Keahole Point, Hawaii", "10,825 kg", False),
        ("Cyanotech Block C", "Keahole Point, Hawaii", "5,489 kg", False)]
y = 2.52
for name, loc, kg, ok in ROWS:
    t = tb(s, 0.9, y, 3.0, 0.3)
    para(t, name, size=12.5, color=INK, bold=True, first=True)
    t = tb(s, 0.9, y + 0.24, 3.0, 0.3)
    para(t, loc, size=10, color=INK3, first=True)
    t = tb(s, 3.7, y + 0.06, 1.5, 0.3)
    para(t, kg, size=11.5, color=INK2, font=MONO, align=PP_ALIGN.RIGHT, first=True)
    badge(s, 5.42, y + 0.04, "Verified" if ok else "Needs review", ok=ok)
    rule(s, 0.9, y + 0.62, 6.1)
    y += 0.72

panel(s, 7.64, 2.46, 4.8, 2.12, accent=True)
tf = tb(s, 7.96, 2.70, 4.2, 0.3)
para(tf, "Reported across six blocks", size=10, color=INK3, bold=True,
     caps=True, char_space=1.0, first=True)
tf = tb(s, 7.96, 3.00, 4.2, 0.7)
rich(tf, [("154.3", {"size": 40, "color": INK, "font": DISPLAY}),
          (" t CO\u2082", {"size": 17, "color": INK3, "font": DISPLAY})],
     spacing=1.0, first=True)
rule(s, 7.96, 3.86, 4.16)
tf = tb(s, 7.96, 3.94, 2.8, 0.3)
para(tf, "Supported by imagery", size=11.5, color=VERIFIED, first=True)
tf = tb(s, 10.4, 3.94, 1.76, 0.3)
para(tf, "122.3 t", size=11.5, color=INK2, font=MONO, align=PP_ALIGN.RIGHT, first=True)
rule(s, 7.96, 4.26, 4.16)
tf = tb(s, 7.96, 4.34, 2.8, 0.3)
para(tf, "Held for review", size=11.5, color=REVIEW, first=True)
tf = tb(s, 10.4, 4.34, 1.76, 0.3)
para(tf, "32.1 t", size=11.5, color=INK2, font=MONO, align=PP_ALIGN.RIGHT, first=True)

tf = tb(s, 7.64, 4.78, 4.8, 1.9)
rich(tf, [("The blocks were ",),
          ("delineated from the imagery", {"bold": True, "color": INK}),
          (", not drawn by hand: pixels holding chlorophyll across every date "
           "in the window, clustered inside each validated facility footprint.",)],
     size=12, spacing=1.32, first=True)
para(tf, "Cyanotech\u2019s three blocks flag on their own data \u2014 sparser "
         "cloud-free imagery, six usable dates against Earthrise\u2019s nine. "
         "That is a property of the evidence, not a claim about the company.",
     size=10.5, color=INK3, spacing=1.3, space_before=10)
footer(s, 6)

# =========================================================== 7. report
s = new_slide()
eyebrow(s, "The output")
heading(s, "A document whose identity is its figures.", w=9.4)

panel(s, 0.9, 2.5, 5.3, 3.2, accent=True)
tf = tb(s, 1.22, 2.78, 2.6, 0.3)
para(tf, "BF-2026-83D755", size=12, color=TEAL, font=MONO, first=True)
badge(s, 4.62, 2.74, "Verified", ok=True)
tf = tb(s, 1.22, 3.32, 4.6, 0.3)
para(tf, "CO\u2082 fixed, reporting period", size=10, color=INK3, bold=True,
     caps=True, char_space=1.0, first=True)
tf = tb(s, 1.22, 3.62, 4.6, 0.8)
rich(tf, [("45,624", {"size": 40, "color": INK, "font": DISPLAY}),
          (" kg", {"size": 17, "color": INK3, "font": DISPLAY})],
     spacing=1.0, first=True)
yy = 4.52
for label, value in (("Period", "2026-08-01 \u2192 09-11  \u00b7  42 d"),
                     ("Agreement with imagery", "87.4%"),
                     ("Rule applied", "RULE-001")):
    rule(s, 1.22, yy, 4.66)
    t = tb(s, 1.22, yy + 0.09, 2.6, 0.3)
    para(t, label, size=11.5, color=INK2, first=True)
    t = tb(s, 3.5, yy + 0.09, 2.38, 0.3)
    para(t, value, size=11, color=INK2, font=MONO, align=PP_ALIGN.RIGHT, first=True)
    yy += 0.40

tf = tb(s, 6.94, 2.5, 5.5, 1.0)
rich(tf, [("The report id is not a serial number. It is a ",),
          ("SHA-256 over what the report asserts", {"bold": True, "color": INK}),
          (" \u2014 site, period, CO\u2082 figure, verdict, rule.",)],
     size=14, spacing=1.34, first=True)
tf = tb(s, 6.94, 3.62, 5.5, 2.1)
bullets(tf, [[("Re-run the demo and the same data mints the ",),
              ("same id", {"bold": True, "color": INK}),
              (", so yesterday\u2019s screenshot still matches today\u2019s system.",)],
             [("Move the published figure by ",),
              ("0.01 kg", {"font": MONO, "color": INK}),
              (" and the id changes. Flip the verdict and it changes again.",)],
             [("The timestamp is deliberately ",),
              ("excluded", {"bold": True, "color": INK}),
              (" from the hash \u2014 otherwise the same data would mint a new "
               "identity on every refresh, and the id would prove nothing.",)]])
tf = tb(s, 6.94, 5.72, 5.5, 0.6)
para(tf, "Minting a sequence would imply an issuing authority this platform is "
         "not. A fingerprint claims only what it can back.",
     size=10.5, color=INK3, spacing=1.3, first=True)
footer(s, 7)

# =========================================================== 8. honesty
s = new_slide()
eyebrow(s, "Straight answer")
heading(s, "What\u2019s real, what isn\u2019t, and what we left out.", w=9.4)

panel(s, 0.9, 2.5, 3.68, 3.5, accent=True)
tf = tb(s, 1.16, 2.78, 3.2, 0.3)
para(tf, "Real", size=11, color=VERIFIED, bold=True, caps=True,
     char_space=1.1, first=True)
tf = tb(s, 1.16, 3.14, 3.16, 2.7)
bullets(tf, ["Sentinel-2 imagery indices, from Copernicus.",
             "Both facilities, and the pond blocks themselves.",
             "1.8321 kg CO\u2082 per kg dry biomass, from published microalgae "
             "biofixation work.",
             "The reconciliation logic, and every figure on screen \u2014 "
             "computed in the backend, never in the browser."], size=12)

panel(s, 4.83, 2.5, 3.68, 3.5)
tf = tb(s, 5.09, 2.78, 3.2, 0.3)
para(tf, "Simulated", size=11, color=INK3, bold=True, caps=True,
     char_space=1.1, first=True)
tf = tb(s, 5.09, 3.14, 3.16, 1.6)
bullets(tf, ["The sensor stream: a logistic growth curve with a diurnal cycle "
             "and noise, standing in for pond hardware we do not have."],
        size=12, dash=LINE_STR)
tf = tb(s, 5.09, 4.44, 3.16, 1.2)
para(tf, "Which is the honest shape of the problem \u2014 the sensor side is "
         "exactly the side nobody should have to take on trust.",
     size=10.5, color=INK3, spacing=1.3, first=True)

panel(s, 8.76, 2.5, 3.68, 3.5)
tf = tb(s, 9.02, 2.78, 3.2, 0.3)
para(tf, "Out of scope, deliberately", size=11, color=INK3, bold=True,
     caps=True, char_space=1.1, first=True)
tf = tb(s, 9.02, 3.14, 3.16, 2.7)
bullets(tf, [[("Auth and multi-tenancy.",)],
             [("A live credit registry or blockchain.",)],
             [("Permanence.", {"bold": True, "color": INK}),
              (" We report carbon as ",),
              ("fixed", {"italic": True, "color": INK}),
              (", not as permanently sequestered: what happens to harvested "
               "biomass is outside what this platform can see.",)]],
        size=12, dash=LINE_STR)
footer(s, 8)

# =========================================================== 9. built
s = new_slide()
eyebrow(s, "Built")
heading(s, "Deployed, gated, and it runs with the wifi off.", w=9.4)

panel(s, 0.9, 2.5, 5.5, 1.62)
tf = tb(s, 1.22, 2.76, 4.9, 0.3)
para(tf, "Stack", size=10.5, color=INK3, bold=True, caps=True,
     char_space=1.1, first=True)
tf = tb(s, 1.22, 3.10, 4.9, 1.0)
rich(tf, [("FastAPI and React/Vite, shipped as ",),
          ("one service on one origin", {"bold": True, "color": INK}),
          (" \u2014 the API serves the built dashboard itself, so there is no "
           "CORS allowlist, no second host, and no production proxy to "
           "misconfigure.",)], size=12, spacing=1.3, first=True)

panel(s, 0.9, 4.28, 5.5, 1.72)
tf = tb(s, 1.22, 4.54, 4.9, 0.3)
para(tf, "The stage fallback", size=10.5, color=INK3, bold=True, caps=True,
     char_space=1.1, first=True)
tf = tb(s, 1.22, 4.88, 4.9, 1.0)
rich(tf, [("npm run demo", {"font": MONO, "color": INK}),
          (" brings the whole platform up on one local port in the same shape "
           "the cloud runs, with ",),
          ("no internet at all", {"bold": True, "color": INK}),
          (". The build fails if the page so much as references an external "
           "origin.",)], size=12, spacing=1.3, first=True)

panel(s, 6.94, 2.5, 5.5, 3.5, accent=True)
tf = tb(s, 7.26, 2.78, 4.9, 0.3)
para(tf, "Every phase has a gate, and they all pass", size=10.5, color=INK3,
     bold=True, caps=True, char_space=1.1, first=True)
yy = 3.24
for label, value, col in (
        ("Data, CO\u2082 engine, reconciliation", "38  \u00b7  47  \u00b7  34", INK2),
        ("Dashboard, report, deployment", "107  \u00b7  184  \u00b7  128", INK2),
        ("Against the live service", "125 / 125", VERIFIED)):
    rule(s, 7.26, yy, 4.86)
    t = tb(s, 7.26, yy + 0.10, 3.1, 0.34)
    para(t, label, size=11.5, color=col, first=True)
    t = tb(s, 10.2, yy + 0.10, 1.92, 0.3)
    para(t, value, size=11, color=INK2, font=MONO, align=PP_ALIGN.RIGHT, first=True)
    yy += 0.46
tf = tb(s, 7.26, 4.86, 4.9, 1.1)
para(tf, "The gates drive a real browser and compare every figure on screen to "
         "the API behind it. The report is exported through Chrome\u2019s own "
         "print pipeline and checked as PDF bytes, so \u201cexport\u201d means the "
         "artifact, not the button.",
     size=10.5, color=INK3, spacing=1.32, first=True)
footer(s, 9)

# =========================================================== 10. close
s = new_slide()
eyebrow(s, "Pixel Error  \u00b7  HackOut\u201926", y=2.0)
tf = tb(s, 0.9, 2.42, 9.8, 2.2)
para(tf, "We don\u2019t just show sensor numbers \u2014 we prove them.",
     size=46, color=INK, font=DISPLAY, spacing=1.08, first=True)
tf = tb(s, 0.9, 4.72, 8.2, 0.9)
para(tf, "Six ponds, two real facilities, one independent instrument, and a "
         "rule that says out loud when the numbers stop agreeing.",
     size=15, color=INK2, spacing=1.34, first=True)
tf = tb(s, 0.9, 5.78, 8.0, 0.4)
para(tf, "algae-carbon-platform.onrender.com", size=13, color=TEAL, font=MONO,
     first=True)
footer(s, 10)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir,
                   "BioFix_Deck.pptx")
prs.save(OUT)
print("saved", os.path.normpath(OUT))
print("slides:", len(prs.slides._sldIdLst))
