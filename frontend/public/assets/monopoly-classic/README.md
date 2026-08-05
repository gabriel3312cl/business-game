# Monopoly clasico, 40 casillas, en espanol

## Contenido
- `svg/` los 13 iconos del tablero, mas casa y hotel para las construcciones
- `manifest.json` las 40 casillas con precio, hipoteca, rentas por nivel, costo de casa y color de grupo,
  mas los dos mazos completos de 16 cartas
- `index.html` hoja de contacto con los iconos y los ocho colores de grupo

## Por que las propiedades no tienen icono
El tablero original no ilustra las calles, las identifica solo con la banda de color. Las 22 propiedades
traen `svg: null` y el hex del grupo en `color`. Si tu implementacion necesita un icono igual, reusa
`casa.svg` tenido con el color del grupo.

## Estilo
viewBox 64x64, trazo 2.5, `stroke="currentColor"`. Mismo sistema que el set de Santiago, asi que los dos
tableros se pueden montar con el mismo componente.

## Licencia
Los nombres de calle y el diseno del tablero son marca registrada de Hasbro. Los SVG son originales.
Uso personal.
