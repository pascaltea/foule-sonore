# Prépare les images de la Créature à partir de l'affiche d'origine : un recadrage tel quel,
# et pour chaque oeil un masque du blanc de l'oeil et l'iris d'origine (complété par symétrie).
import sys, json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
BOX = (736, 5900, 6536, 8760); AW = 2400
c = im.crop(BOX); AH = round(AW * c.height / c.width)
a = c.resize((AW, AH), Image.LANCZOS)
a.save(out + '/creature.jpg', quality=88, optimize=True, progressive=True)
A = np.asarray(a).astype(int)
white = (A.min(axis=2) > 175)
# Les deux yeux : grandes zones blanches dans le bas de l'image, de part et d'autre du centre.
ys = slice(int(AH * 0.72), AH)
meta = {'w': AW, 'h': AH, 'eyes': []}
cols = white[ys].sum(axis=0) > 25
runs, start = [], None
for x in range(AW):
    if cols[x] and start is None: start = x
    if not cols[x] and start is not None:
        if x - start > 150: runs.append((start, x))
        start = None
print('runs', runs)
for (x0, x1) in runs[:2] if len(runs) == 2 else sorted(runs, key=lambda r: r[0]-r[1])[:2]:
    sub = white[ys, x0:x1]
    rows = np.where(sub.sum(axis=1) > 5)[0]
    y0 = ys.start + rows[0] - 6; y1 = ys.start + rows[-1] + 8
    x0 -= 6; x1 += 6
    W, H = x1 - x0, y1 - y0
    wh = white[y0:y1, x0:x1]
    top = np.full(W, -1); bot = np.full(W, -1)
    for x in range(W):
        r = np.where(wh[:, x])[0]
        if len(r) > 3: top[x] = r[0]; bot[x] = r[-1]
    valid = np.where(top >= 0)[0]
    # Ligne du sol : ajustée sur le bas du blanc, loin de l'iris (bords gauche et droit).
    n = len(valid); side = np.concatenate([valid[int(n*0.06):int(n*0.2)], valid[int(n*0.8):int(n*0.94)]])
    k, b = np.polyfit(side, bot[side], 1)
    mask = np.zeros((H, W), bool)
    for x in valid:
        g = int(round(k * x + b)); mask[top[x]:max(g, top[x]) + 1, x] = True
    # Iris : ce qui n'est pas blanc à l'intérieur du masque (légèrement érodé).
    er = mask.copy()
    for _ in range(5):
        e2 = er.copy(); e2[1:] &= er[:-1]; e2[:-1] &= er[1:]; e2[:, 1:] &= er[:, :-1]; e2[:, :-1] &= er[:, 1:]; er = e2
    P = A[y0:y1, x0:x1]
    dark = er & (P.min(axis=2) < 120)
    # plus grande bande de colonnes sombres = iris
    dc = dark.sum(axis=0) > 6; best = (0, 0); s = None
    for x in range(W + 1):
        v = x < W and dc[x]
        if v and s is None: s = x
        if not v and s is not None:
            if x - s > best[1] - best[0]: best = (s, x)
            s = None
    ix0, ix1 = best; r = (ix1 - ix0) / 2; icx = (ix0 + ix1) / 2
    itop = np.where(dark[:, ix0:ix1].sum(axis=1) > 3)[0][0]
    icy = itop + r; ground = k * icx + b
    print('eye', (x0, y0, W, H), 'iris cx,cy,r', round(icx,1), round(icy,1), round(r,1), 'ground@cx', round(ground,1), 'slope', round(k,3))
    # Iris complet : moitié visible + son reflet (le dessin d'origine, simplement complété).
    R = int(round(r)) + 3; S = 2 * R + 1
    spr = np.zeros((S, S, 4), np.uint8)
    cut = min(icy, ground - 2.5)  # dernière ligne fiable au-dessus du sol
    band = max(1.0, icy - cut + 0.5)
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            d = (dx * dx + dy * dy) ** 0.5
            if d > r + 1.5: continue
            sx, sy, hidden = dx, dy, icy + dy > cut
            if hidden:                           # partie cachée par le sol : même rayon, pris dans la partie visible
                if d <= band: sx, sy = 0, -band
                else:
                    sy = -max(abs(dy), band); sx = (1 if dx >= 0 else -1) * max(0.0, d * d - sy * sy) ** 0.5
            yy, xx = int(round(icy + sy)), int(round(icx + sx))
            if 0 <= yy < H and 0 <= xx < W:
                px = P[yy, xx].copy()
                if d < r * 0.55 and px.min() > 110 and hidden: px = np.array([6, 9, 8])     # le reflet n'est gardé qu'une fois
                edge = min(1.0, max(0.0, (r + 1.5) - d))
                spr[dy + R, dx + R] = [*px, int(255 * edge)]
    # bord extérieur blanc résiduel -> transparent
    for y in range(S):
        for x in range(S):
            d = ((x - R) ** 2 + (y - R) ** 2) ** 0.5
            if d > r * 0.8 and spr[y, x, :3].min() > 150: spr[y, x, 3] = 0
    name = 'L' if x0 < AW / 2 else 'R'
    Image.fromarray(spr, 'RGBA').save(f'{out}/iris{name}.png', optimize=True)
    m = np.zeros((H, W, 4), np.uint8); m[..., :3] = 255; m[..., 3] = mask * 255
    Image.fromarray(m, 'RGBA').save(f'{out}/eye{name}-mask.png', optimize=True)
    sc = P[mask & wh].mean(axis=0).round().astype(int).tolist()
    ring = np.array([P[top[x] - d, x] for x in valid[len(valid)//6:-len(valid)//6] for d in range(5, 12) if top[x] - d >= 0]); lid = np.percentile(ring, 35, axis=0).round().astype(int).tolist()
    tops = [int(top[x]) if top[x] >= 0 else -1 for x in range(W)]
    meta['eyes'].append({'id': name, 'x': int(x0), 'y': int(y0), 'w': int(W), 'h': int(H), 'icx': round(float(icx), 1), 'icy': round(float(min(icy, ground)), 1), 'ir': round(float(r), 1),
                         'top': int(min(t for t in tops if t >= 0)), 'gk': round(float(k), 4), 'gb': round(float(b), 1), 'white': sc, 'lid': lid})
json.dump(meta, open(out + '/creature.json', 'w'))
print(json.dumps(meta))
