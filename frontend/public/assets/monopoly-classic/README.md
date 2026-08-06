# Monopoly clasico, 40 casillas, en espanol

## Contenido
- `svg/` contiene los 13 iconos usados por el tablero.
- La definición jugable está en `content/packs/classic-demo/`.

## Por que las propiedades no tienen icono
El tablero original no ilustra las calles, las identifica solo con la banda de color. Las 22 propiedades
traen `svg: null` y el hex del grupo en `color`.

## Estilo
viewBox 64x64, trazo 2.5, `stroke="currentColor"`. Mismo sistema que el set de Santiago, asi que los dos
tableros se pueden montar con el mismo componente.

## Licencia
Los nombres de calle y el diseno del tablero son marca registrada de Hasbro. Los SVG son originales.
Uso personal.
