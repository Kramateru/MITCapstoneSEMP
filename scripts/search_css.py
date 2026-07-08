from pathlib import Path
p=Path('frontend/app/globals.css')
if not p.exists():
    print('FILE_NOT_FOUND')
    raise SystemExit(2)
for i,line in enumerate(p.read_text(encoding='utf-8',errors='replace').splitlines(),1):
    if 'max-height' in line or 'max-h-' in line or 'max-h-[' in line:
        print(f'{i}: {line}')
