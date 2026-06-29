#!/usr/bin/env python3
"""Generate high-quality apple-touch-icon.png from the 1024x1024 source."""
import subprocess
import os

src = '/tmp/icon-dark-1024.png'
dst = 'artifacts/aero-sentinel/public/apple-touch-icon.png'

# Use sips to resize to 180x180
result = subprocess.run(
    ['sips', '-z', '180', '180', src, '--out', dst],
    capture_output=True, text=True
)
print(f"sips stdout: {result.stdout}")
print(f"sips stderr: {result.stderr}")
print(f"sips returncode: {result.returncode}")

if os.path.exists(dst):
    sz = os.path.getsize(dst)
    print(f"Output file: {dst} ({sz} bytes)")
else:
    print(f"ERROR: Output file not created!")
