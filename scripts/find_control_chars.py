import sys
from pathlib import Path
p = Path('frontend/app/globals.css')
if not p.exists():
    print('FILE_NOT_FOUND', p)
    sys.exit(2)
found = False
for i, line in enumerate(p.read_text(encoding='utf-8', errors='replace').splitlines(), start=1):
    for j, ch in enumerate(line):
        if ord(ch) < 32 and ch not in ('\t'):
            print(f'LINE {i}: COL {j+1} ORD {ord(ch)} HEX {ord(ch):02x} - context: {repr(line[:60])}...')
            found = True
            break
if not found:
    print('NO_CONTROL_CHARS_FOUND')
