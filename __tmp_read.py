base = r'c:\Users\mario\OneDrive\Documents\PRENDARIOS\BBVA (2da etapa)\WEB\SUbir\Experiencia2\NuevaCalculadora'
js = open(base+r'\main.js', encoding='utf-8').readlines()
html = open(base+r'\index.html', encoding='utf-8').readlines()

print("=== fitResultadoCuota JS ===")
for i,l in enumerate(js,1):
    if 'function fitResultadoCuota' in l:
        for j in range(i-1, min(i+45, len(js))):
            print(str(j+1)+': '+js[j], end='')
        break

print("\n=== HTML resultado-stack region ===")
for i,l in enumerate(html,1):
    if 'resultado-stack' in l or 'resultadoCuota' in l or 'frase-uva' in l or 'frase-moto' in l or 'btnCalcular' in l:
        start=max(0,i-3)
        end=min(len(html),i+3)
        for j in range(start,end):
            print(str(j+1)+': '+html[j], end='')
        print('---')
