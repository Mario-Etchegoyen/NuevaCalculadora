from PIL import Image
import os

base = os.path.dirname(os.path.abspath(__file__))
src   = os.path.join(base, 'Imagenes', 'logoTuPrendario.png')
out192 = os.path.join(base, 'Imagenes', 'icon-192.png')
out512 = os.path.join(base, 'Imagenes', 'icon-512.png')

logo = Image.open(src).convert('RGBA')

def make_icon(size):
    c = Image.new('RGBA', (size, size), (7, 33, 70, 255))
    s = size * 0.75 / logo.width
    w, h = int(logo.width * s), int(logo.height * s)
    r = logo.resize((w, h), Image.LANCZOS)
    c.paste(r, ((size - w) // 2, (size - h) // 2), r)
    return c.convert('RGB')

make_icon(192).save(out192, 'PNG')
make_icon(512).save(out512, 'PNG')

print('192:', os.path.getsize(out192), 'bytes')
print('512:', os.path.getsize(out512), 'bytes')
