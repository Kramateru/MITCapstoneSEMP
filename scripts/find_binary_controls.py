from pathlib import Path
p=Path('frontend/app/globals.css')
if not p.exists():
    print('FILE_NOT_FOUND')
    raise SystemExit(2)
b = p.read_bytes()
allowed = {9,10,13}
found=False
for i,byte in enumerate(b,1):
    if byte < 32 and byte not in allowed:
        print(f'BYTE_OFFSET {i} BYTE 0x{byte:02x}')
        found=True
        break
if not found:
    print('NO_BINARY_CONTROL_BYTES')
