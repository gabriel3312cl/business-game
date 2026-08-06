# Monopoly Santiago, set de assets

## Contenido
- `svg/` pictogramas de las 48 casillas, uno por elemento unico
- `svg-fichas/` las 6 fichas de jugador
- `frontend/src/assets/monopoly-santiago-manifest.json` mantiene el mapa usado
  por el editor para relacionar posiciones y rutas SVG.

## Convencion de codigo
El codigo de cada casilla es `POS_TIPO`, con POS de 01 a 48 en sentido horario desde la Salida.
El nombre de archivo del svg lleva el mismo numero de posicion: `p26_ahumada.svg` es la casilla 26.
Los assets que se repiten en el tablero (Fondo Vecinal en 3, 21, 29 y 40, Suerte en 10, 27 y 45)
tienen un solo archivo y el manifest los apunta desde cada posicion.

## Estilo
viewBox 64x64, trazo de 2.5, `stroke="currentColor"`. Heredan el color del contenedor,
asi que para pintar un pictograma con el color de su grupo basta con `color: #f0902e` en el padre.
Sin fondo, sin texto, escalan a cualquier tamano.

## Reemplazar por fotos
Cada casilla del manifest trae `foto_sugerida` con lo que conviene retratar. Para material con
licencia libre, Wikimedia Commons tiene buena cobertura de hitos de Santiago y hay que revisar la
licencia de cada archivo una por una. No incluyo enlaces porque cambian y no los puedo verificar.
