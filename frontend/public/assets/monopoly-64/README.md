# Monopoly expandido, 64 casillas

## Contenido
- `svg/` contiene los 18 iconos usados por el tablero: 13 heredados del set
  clasico y 5 nuevos para subasta, gas, telecomunicaciones, impuesto al
  patrimonio y contribuciones.
- La definición jugable está en `content/packs/extended-demo/`.

## Layout
15 casillas por lado mas 4 esquinas. Las esquinas van en 1, 17, 33 y 49, asi que la Carcel y
Ve a la Carcel quedan a medio tablero de distancia, igual que en el original.

## Por que las propiedades no tienen icono
Igual que en el set clasico, las 34 propiedades se identifican solo con la banda de color del grupo.
Traen `svg: null` y el hex en `color`.

## Reglas propias de esta variante
- Subasta, casillas 14 y 43. Es la mecanica que sostiene el tablero: saca propiedades del limbo
  y acelera la formacion de monopolios, que es el cuello de botella al expandir a 64.
- Cuatro impuestos en vez de dos. Patrimonio y Contribuciones son progresivos, cobran mas al que
  va ganando.
- Cobro de Salida 300, no 200. Con 64 casillas pasas cada nueve turnos en vez de cada seis.
- 5 o 6 jugadores. Con 2 o 3 no se forman grupos completos y la partida no cierra.

## Estilo
viewBox 64x64, trazo 2.5, `stroke="currentColor"`. Mismo sistema que los sets de Santiago y clasico,
por lo que los tableros comparten el mismo componente visual.

## Licencia
Variante no oficial. Nombres y diseno original son marca registrada de Hasbro. SVG originales.
Uso personal.
