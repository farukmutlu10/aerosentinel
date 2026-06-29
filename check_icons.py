import struct, os

def png_dimensions(path):
    with open(path, 'rb') as f:
        f.read(8)  # skip PNG signature
        f.read(4)  # IHDR length
        f.read(4)  # IHDR tag
        w = struct.unpack('>I', f.read(4))[0]
        h = struct.unpack('>I', f.read(4))[0]
        return w, h

def jpg_dimensions(path):
    """Read JPEG dimensions from SOF0 marker"""
    with open(path, 'rb') as f:
        f.read(2)  # SOI
        while True:
            marker = f.read(2)
            if len(marker) < 2:
                break
            if marker[0] != 0xFF:
                break
            if marker[1] in (0xC0, 0xC1, 0xC2):
                f.read(3)  # length + precision
                h = struct.unpack('>H', f.read(2))[0]
                w = struct.unpack('>H', f.read(2))[0]
                return w, h
            else:
                length = struct.unpack('>H', f.read(2))[0]
                f.read(length - 2)
    return 0, 0

base = 'artifacts/aero-sentinel/public'
pngs = ['apple-touch-icon.png', 'favicon-192.png', 'favicon-512.png', 'favicon.png', 'favicon-32.png', 'favicon-16.png', 'alert-icon.png']
jpgs = ['opengraph.jpg']

for f in pngs:
    path = os.path.join(base, f)
    w, h = png_dimensions(path)
    sz = os.path.getsize(path)
    print(f'{f}: {w}x{h} ({sz} bytes)')

for f in jpgs:
    path = os.path.join(base, f)
    w, h = jpg_dimensions(path)
    sz = os.path.getsize(path)
    print(f'{f}: {w}x{h} ({sz} bytes)')
