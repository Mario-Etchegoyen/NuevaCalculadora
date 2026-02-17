# Casos de prueba manual para la calculadora de préstamos

Marca cada caso como OK o ERROR tras probarlo en la web.

| # | Tipo Vehículo | Combustible         | Condición | Cilindrada/Potencia | Año (ejemplo) | Plazos esperados según año | Tasa esperada | Frase UVA visible | Resultado |
|---|---------------|---------------------|-----------|---------------------|---------------|---------------------------|---------------|-------------------|-----------|
| 1 | Auto          | Nafta/Diesel        | 0km       | -                   | Actual        | 12, 24, 36, 48            | Fija          | Sí                |           |
| 2 | Auto          | Nafta/Diesel        | Usado     | -                   | Actual-0      | 12, 24, 36, 48, 60        | Fija/UVA      | Sí                |           |
| 3 | Auto          | Nafta/Diesel        | Usado     | -                   | Actual-7      | 12, 24, 36, 48, 60        | Fija/UVA      | Sí                |           |
| 4 | Auto          | Nafta/Diesel        | Usado     | -                   | Actual-8      | 12, 24, 36, 48            | Fija/UVA      | Sí                |           |
| 5 | Auto          | Nafta/Diesel        | Usado     | -                   | Actual-9      | 12, 24, 36                | Fija/UVA      | Sí                |           |
| 6 | Auto          | Híbrido/Eléctrico   | 0km       | -                   | Actual        | 12, 24, 36, 48            | Fija          | No                |           |
| 7 | Auto          | Híbrido/Eléctrico   | Usado     | -                   | Actual-2      | 12, 24, 36, 48            | Fija          | No                |           |
| 8 | Utilitario    | Nafta/Diesel        | 0km       | -                   | Actual        | 12, 24, 36, 48            | Fija          | Sí                |           |
| 9 | Utilitario    | Nafta/Diesel        | Usado     | -                   | Actual-0      | 12, 24, 36, 48, 60        | Fija/UVA      | Sí                |           |
|10 | Utilitario    | Nafta/Diesel        | Usado     | -                   | Actual-8      | 12, 24, 36, 48            | Fija/UVA      | Sí                |           |
|11 | Utilitario    | Nafta/Diesel        | Usado     | -                   | Actual-9      | 12, 24, 36                | Fija/UVA      | Sí                |           |
|12 | Utilitario    | Híbrido/Eléctrico   | 0km       | -                   | Actual        | 12, 24, 36, 48            | Fija          | No                |           |
|13 | Utilitario    | Híbrido/Eléctrico   | Usado     | -                   | Actual-2      | 12, 24, 36, 48            | Fija          | No                |           |
|14 | Moto          | Nafta               | 0km       | 100cc               | Actual        | 12, 24, 36                | Fija          | No                |           |
|15 | Moto          | Nafta               | 0km       | 200cc               | Actual        | 12, 24, 36, 48            | Fija/UVA      | Sí                |           |
|16 | Moto          | Nafta               | Usado     | 500cc               | Actual-0      | 12, 24, 36, 48, 60        | Fija/UVA      | Sí                |           |
|17 | Moto          | Eléctrico           | 0km       | 1200w               | Actual        | 12, 24, 36, 48, 60        | Fija/UVA      | Sí                |           |
|18 | Moto          | Eléctrico           | 0km       | 1000w               | Actual        | 12, 24, 36, 48, 60        | Fija          | No                |           |
|19 | Cuatriciclo   | Nafta               | 0km       | -                   | Actual        | 12, 24, 36, 48, 60        | Fija/UVA      | Sí                |           |
|20 | Cuatriciclo   | Eléctrico           | 0km       | -                   | Actual        | 12, 24, 36, 48, 60        | Fija/UVA      | Sí                |           |

Notas:
- "Actual" es el año más reciente en el desplegable.
- "Actual-0" es igual a "Actual", "Actual-7" es el octavo año, etc.
- Para motos, prueba cilindrada/potencia baja, media y alta.
- Marca "Sí" en Frase UVA si aparece "AUTOS/UTILITARIOS".
- Repite para condición Usado y 0km en cada tipo.

Puedes agregar filas para más combinaciones si lo deseas.