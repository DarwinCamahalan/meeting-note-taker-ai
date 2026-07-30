#!/usr/bin/env python3
"""Generate build/icon.png (1024x1024) for AssistMe — no external deps.

A rounded-square app tile with an indigo→violet diagonal gradient (matches the
web brand) and a minimal white "cue" glyph: a speech bubble with a caret,
evoking a real-time prompt. Pure stdlib (zlib + struct) PNG writer so the build
needs no Pillow/ImageMagick. electron-builder (buildResources: build) auto-picks
build/icon.png and derives the .icns / .ico from it.
"""
import struct
import zlib

N = 1024


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_square_alpha(x, y, size, radius):
    """Coverage (0..1) of a rounded square occupying [0,size) with corner radius."""
    r = radius
    # nearest point clamp for corner distance
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    dx = x - cx
    dy = y - cy
    dist = (dx * dx + dy * dy) ** 0.5
    # antialias 1px edge on the rounded corners; straight edges are inside.
    return max(0.0, min(1.0, r + 0.5 - dist)) if (dx or dy) else 1.0


def bubble_alpha(x, y):
    """Coverage of a rounded speech-bubble + caret centered in the tile."""
    # Bubble body: rounded rect
    bx0, by0, bx1, by1 = 300, 300, 724, 620
    br = 70
    inside = 0.0
    if bx0 <= x <= bx1 and by0 <= y <= by1:
        # distance to rounded-rect edge
        cx = min(max(x, bx0 + br), bx1 - br)
        cy = min(max(y, by0 + br), by1 - br)
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        inside = max(0.0, min(1.0, br + 0.5 - d))
    # Caret (tail) triangle pointing down-left below the body
    # triangle with vertices (400,600)-(520,600)-(410,700)
    tx = [400, 520, 410]
    ty = [600, 600, 700]

    def sign(ax, ay, bx, by, px, py):
        return (px - bx) * (ay - by) - (ax - bx) * (py - by)

    d1 = sign(tx[0], ty[0], tx[1], ty[1], x, y)
    d2 = sign(tx[1], ty[1], tx[2], ty[2], x, y)
    d3 = sign(tx[2], ty[2], tx[0], ty[0], x, y)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    tri = 0.0 if (has_neg and has_pos) else 1.0
    return max(inside, tri)


def dot_alpha(x, y):
    """Three cue dots inside the bubble."""
    a = 0.0
    for cx in (420, 512, 604):
        d = ((x - cx) ** 2 + (y - 455) ** 2) ** 0.5
        a = max(a, max(0.0, min(1.0, 26.0 - d)))
    return a


rows = bytearray()
for y in range(N):
    rows.append(0)  # PNG filter type 0 (none) per scanline
    for x in range(N):
        t = (x + y) / (2 * N)
        # indigo #6366f1 -> violet #a855f7
        r = int(lerp(0x63, 0xA8, t))
        g = int(lerp(0x66, 0x55, t))
        b = int(lerp(0xF1, 0xF7, t))
        tile = rounded_square_alpha(x, y, N, 220)
        # compose white glyph over gradient
        glyph = bubble_alpha(x, y)
        dots = dot_alpha(x, y)  # holes: subtract from bubble to reveal gradient
        body = max(0.0, glyph - dots)
        r = int(lerp(r, 0xFF, body))
        g = int(lerp(g, 0xFF, body))
        b = int(lerp(b, 0xFF, body))
        a = int(255 * tile)
        rows += bytes((r, g, b, a))


def chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0))  # 8-bit RGBA
png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
png += chunk(b"IEND", b"")

with open("icon.png", "wb") as f:
    f.write(png)
print(f"wrote icon.png ({len(png)} bytes, {N}x{N} RGBA)")
