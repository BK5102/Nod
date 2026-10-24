"""Offline data generation: renders the phone-photo sample invoice used by the intake demo and test."""
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

random.seed(7)
W, H = 900, 1180
paper = Image.new("RGB", (W, H), (246, 244, 236))
d = ImageDraw.Draw(paper)
def font(size, bold=False):
    for name in (["arialbd.ttf"] if bold else []) + ["arial.ttf", "DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()
y = 70
d.text((70, y), "CLEANPATH JANITORIAL", font=font(46, True), fill=(30, 30, 34)); y += 70
d.text((70, y), "Commercial cleaning since 2009  |  cleanpath.net", font=font(22), fill=(70, 70, 76)); y += 70
d.line((70, y, W - 70, y), fill=(60, 60, 60), width=3); y += 30
rows = [("INVOICE #", "CP-5507"), ("DATE", "06/05/2026"), ("DUE", "07/05/2026"), ("BILL TO", "EASTBAY COMMUNITY PANTRY"), ("P.O.", "PO-2026-C1")]
for k, v in rows:
    d.text((70, y), k, font=font(26, True), fill=(40, 40, 44)); d.text((330, y), v, font=font(26), fill=(25, 25, 30)); y += 46
y += 30
d.text((70, y), "DESCRIPTION", font=font(24, True), fill=(40, 40, 44)); d.text((W - 260, y), "AMOUNT", font=font(24, True), fill=(40, 40, 44)); y += 44
d.text((70, y), "Weekly warehouse cleaning, June", font=font(26), fill=(25, 25, 30)); d.text((W - 260, y), "$680.00", font=font(26), fill=(25, 25, 30)); y += 80
d.line((W - 420, y, W - 70, y), fill=(60, 60, 60), width=2); y += 20
d.text((W - 420, y), "TOTAL", font=font(30, True), fill=(20, 20, 24)); d.text((W - 260, y), "$680.00", font=font(30, True), fill=(20, 20, 24)); y += 90
d.text((70, y), "Remit to account ending 6603. Thank you!", font=font(24), fill=(40, 40, 44)); y += 50
# handwriting-like mark and a coffee ring, the kind of mess a real photo carries
d.text((560, y + 40), "pd?  -M", font=font(40), fill=(35, 60, 140))
d.ellipse((620, 860, 820, 1060), outline=(190, 160, 120), width=6)
# photograph it: a desk behind, a slight rotation, uneven light, blur and sensor noise
desk = Image.new("RGB", (1200, 1500), (92, 78, 64))
rot = paper.rotate(random.uniform(-4.5, -2.5), expand=True, fillcolor=(92, 78, 64))
desk.paste(rot, (130, 140))
shade = Image.new("L", desk.size, 0)
sd = ImageDraw.Draw(shade)
for i in range(0, 1500, 6):
    sd.rectangle((0, i, 1200, i + 6), fill=int(55 * (i / 1500)))
desk = Image.composite(Image.new("RGB", desk.size, (0, 0, 0)), desk, shade.point(lambda v: v // 2))
desk = desk.filter(ImageFilter.GaussianBlur(1.1))
px = desk.load()
for _ in range(90000):
    x, yy = random.randrange(desk.width), random.randrange(desk.height)
    r, g, b = px[x, yy]
    n = random.randint(-18, 18)
    px[x, yy] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
desk = desk.resize((900, 1125))
desk.save("public/samples/cleanpath-photo.jpg", quality=72)
print("wrote public/samples/cleanpath-photo.jpg")
