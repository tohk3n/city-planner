import glob, os
import ftfy

for pattern in ['**/*.js', '**/*.html', '**/*.css', '**/*.md']:
    for f in glob.glob(pattern, recursive=True):
        if not os.path.isfile(f) or 'node_modules' in f or 'dist' in f:
            continue

        text = open(f, encoding='utf-8').read()
        fixed = ftfy.fix_text(text)

        if fixed != text:
            open(f, 'w', encoding='utf-8').write(fixed)
            print(f'Fixed: {f}')