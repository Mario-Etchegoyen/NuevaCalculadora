def dump(path, start, end, out):
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    out.write(f'\n=== {path} lines {start}-{end} ===\n')
    for i, l in enumerate(lines[start-1:end], start):
        out.write(f'{i}: {l}')

with open('__out.txt', 'w', encoding='utf-8') as out:
    dump('styles.css', 918, 1015, out)
    dump('main.js', 785, 870, out)
    dump('main.js', 1537, 1555, out)
    dump('main.js', 1871, 1940, out)
