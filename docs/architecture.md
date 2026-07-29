# Arquitectura inicial

## Decisiones

El servidor es autoritativo. El cliente nunca decide el resultado de un dado,
una compra, un cobro o un intercambio. Envía comandos y recibe estados y eventos.

FastAPI sirve HTTP y `python-socketio` mantiene las salas en tiempo real sobre la
misma aplicación ASGI. PostgreSQL será la fuente durable; Redis podrá agregarse
para presencia y distribución de eventos, pero no será la única copia del juego.

Cada partida fija la versión exacta de su paquete y reglas al crearse. Una
actualización de contenido no puede cambiar una partida en curso.

## Límites

```text
HTTP / Socket.IO
       |
       v
Application service (una transacción por comando)
       |
       +--> Domain commands -> Domain events -> Game state
       |
       +--> Repositories PostgreSQL

Content pack loader -> manifest + board + locale
```

## Paquete de contenido

Cada directorio de `content/packs` contiene:

- `manifest.json`: identidad, versión, topología y locales disponibles.
- `board.json`: casillas, mazos, cartas y parámetros económicos.
- `locales/<idioma>.json`: nombres y textos visibles.

El esquema 4 incorpora parámetros económicos, inventario de casas/hoteles,
detención, dobles, mazos de cartas y reglas opcionales tipadas. El manifiesto y la
versión exacta quedan asociados a la partida; si esa versión ya no está
disponible, el servidor rechaza continuar en vez de aplicar reglas distintas.

Las reglas solo consumen identificadores estables, como `property_01`. Los
nombres traducidos nunca participan en cálculos ni validaciones.

El cargador rechaza:

- identificadores repetidos;
- una cantidad de casillas distinta de la topología;
- esquinas obligatorias ausentes o repetidas;
- cartas que apuntan a casillas o mazos inexistentes;
- claves de traducción inexistentes;
- propiedades sin precio o renta;
- versiones o tipos de casilla inválidos.

## Persistencia y concurrencia

Cada comando abre su propia `AsyncSession` y bloquea la fila de la partida con
`SELECT ... FOR UPDATE`. El estado actualizado, el incremento de versión y los
eventos se escriben en la misma transacción.

La identidad se obtiene del JWT tanto en HTTP como en Socket.IO. Los comandos del
cliente no aceptan `player_id`, por lo que un cliente no puede actuar declarando
la identidad de otro jugador.

El navegador conserva solo el identificador de su partida activa. Al recargar,
vuelve a obtener el estado autoritativo por HTTP y luego se suscribe otra vez a
la sala Socket.IO. Las fichas y el historial se derivan del estado recibido; no
mantienen una copia paralela de posiciones, saldos o eventos.

Los espectadores son miembros de solo lectura: pueden obtener el estado y
suscribirse a la sala, pero no ejecutar comandos. El anfitrión controla el
máximo de jugadores dentro de los límites del paquete y puede habilitar
espectadores mientras la partida está en el lobby. Si el anfitrión sale del
lobby, el rol pasa al primer jugador restante; una sala vacía queda cancelada.
Salir durante una partida equivale a renunciar y reutiliza la liquidación
autoritativa de bancarrota.

Las subastas mantienen la partida bloqueada hasta que queda un único postor
vigente o todos pasan. El dinero se descuenta al cerrar, dentro de la misma
transacción que asigna la propiedad.

Las ofertas de intercambio pueden iniciarse fuera del turno. Solo el destinatario
puede aceptar o rechazar y solo el proponente puede cancelar. Al aceptar se
comprueban nuevamente saldos, participantes y propietarios antes de transferir
todos los activos de forma atómica.

Los valores hipotecarios, costos de construcción, niveles de renta, saldo inicial,
salario al pasar por salida e intereses pertenecen al paquete. El motor aplica
construcción y venta pareja dentro de cada grupo, y bloquea hipotecas o
intercambios que dejarían construcciones en una propiedad transferida.

Una renta o impuesto que excede el saldo crea una deuda explícita. Mientras está
activa, el deudor solo puede vender construcciones, hipotecar, pagar o declararse
en bancarrota. La bancarrota cancela sus ofertas pendientes y transfiere los
activos al acreedor, o los devuelve al banco cuando la deuda es bancaria. En
este último caso, cada propiedad se subasta de forma secuencial antes de
reanudar la partida.

El orden barajado y el cursor de cada mazo forman parte del estado durable. Las
cartas para salir de detención quedan asociadas al jugador y no vuelven a
aparecer en el mazo hasta que se usan. El tamaño del banco de casas y hoteles,
la multa de salida y el máximo de dobles o intentos fallidos pertenecen al
manifiesto del paquete.

Los pagos de cartas entre varios jugadores se procesan como una cola durable. Si
un jugador no puede pagar, se crea una deuda y los pagos restantes continúan
solo después de resolverla. Las reglas opcionales declaran valores por defecto y
qué opciones puede modificar el anfitrión, evitando aceptar opciones que el
paquete no soporta.

La prueba de ciclo completo actúa como un cliente determinista: no modifica
snapshots ni filas directamente y solo envía comandos válidos hasta que queda un
ganador. El mismo escenario se ejecuta sobre los perímetros clásico y extendido
para detectar reglas que dependan accidentalmente de 40 o 64 posiciones.

## Evolución prevista

1. Resolver por subasta la escasez simultánea de casas, si una expansión la exige.
2. Temporizadores opcionales definidos por paquetes de reglas.
3. Paquetes de reglas y expansiones instalables.
4. Consumidores de eventos para analítica e IA, sin acceso de escritura al motor.
