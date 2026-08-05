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
detención, dobles, mazos de cartas y reglas opcionales tipadas. El esquema 5
agrega tableros creados por usuarios, efectos encadenados y efectos declarativos
al aterrizar. El manifiesto y la versión exacta quedan asociados a la partida;
si esa versión ya no está disponible, el servidor rechaza continuar en vez de
aplicar reglas distintas. Las partidas con un tablero personalizado conservan
además un snapshot del paquete exacto.

Un tamaño N×N significa N posiciones por cada lado del cuadrado. Como las cuatro
esquinas pertenecen a dos lados, el perímetro contiene `4N - 4` casillas. El
editor acepta N entre 5 y 30, por lo que genera entre 16 y 116 casillas y no
supone un tablero fijo de 40 posiciones.

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

## Creador de tableros

Los borradores son privados y se guardan en PostgreSQL. Cada escritura exige la
revisión que vio el cliente; dos pestañas que intentan sobrescribir el mismo
borrador reciben un conflicto en vez de perder cambios. Reducir N requiere
confirmación porque elimina casillas del perímetro.

La validación comprueba referencias entre grupos, mazos, cartas y destinos,
además de los campos económicos permitidos para cada tipo de casilla. Los
efectos admitidos son una DSL cerrada y tipada: dinero, pagos entre jugadores,
movimiento absoluto o relativo, destino más cercano, reparaciones, detención y
tarjeta para salir de ella. No se admite JavaScript, Python ni expresiones
arbitrarias.

Publicar crea una versión semántica inmutable. Una modificación posterior vuelve
el proyecto a estado borrador y debe publicarse como una versión mayor que las
anteriores. El catálogo muestra la versión publicada más alta y cada partida
solicita explícitamente la versión que conservará.

## Persistencia y concurrencia

Cada comando abre su propia `AsyncSession` y bloquea la fila de la partida con
`SELECT ... FOR UPDATE`. El estado actualizado, el incremento de versión y los
eventos se escriben en la misma transacción.

La identidad se obtiene de un JWT corto tanto en HTTP como en Socket.IO. Una
sesión opaca de 30 días permite renovar ese token: solo su hash se guarda en
PostgreSQL y el valor original viaja en una cookie HttpOnly revocable. Los
comandos del cliente no aceptan `player_id`, por lo que un cliente no puede
actuar declarando la identidad de otro jugador.

El navegador conserva solo el identificador preferido de su partida activa. Al
recargar, renueva el JWT mediante la cookie, consulta en el servidor sus partidas
activas, vuelve a obtener el estado autoritativo por HTTP y luego se suscribe
otra vez a la sala Socket.IO. Las fichas y el historial se derivan del estado
recibido; no mantienen una copia paralela de posiciones, saldos o eventos.

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

## Bots autoritativos

Los bots son participantes controlados por el servidor y no cuentas humanas
ficticias. Cada uno conserva un UUID dentro del snapshot, declara una personalidad
y decide sobre el estado durable, pero ejecuta exactamente los mismos comandos
tipados que un jugador. El motor sigue validando turnos, dinero, propietarios,
subastas y deudas; la política del bot no puede escribir el estado directamente.

Las personalidades cambian reservas de efectivo, tolerancia al riesgo, valoración
de grupos, pujas, construcción y márgenes de intercambio. La política escrita es
determinista y no depende de un LLM: la misma partida produce la misma jugada, lo
que permite repetir escenarios en tests y es condición del control de secuencia del
ejecutor. Un bot con controlador de IA tampoco redacta comandos; elige entre las
acciones que el servidor ya generó y, si el proveedor falla o demora, se aplica igual
la jugada escrita.

### Negociación

Los tratos viven en un módulo aparte porque valorar una propiedad y valorar un
intercambio son problemas distintos. El precio del tablero ancla lo primero; lo segundo
depende de la cartera completa: una propiedad vale lo que cambia en el patrimonio de
quien la recibe, así cerrar un grupo salta de golpe y romper una pareja se descuenta
solo. Cada trato se descompone en lo que cada lado entrega y en lo que gana después de
haber entregado, para que un cambio dentro de un mismo grupo no se cuente como ganancia
y pérdida a la vez.

Con esa valuación el bot no busca su mejor trato sino el mejor trato que el otro
aceptaría: resuelve el efectivo mínimo que satisface el umbral del receptor, estimado
con la misma lógica sobre información pública, y descarta lo que no deje margen a ambos.
Un jugador humano se modela como equilibrado, porque su temperamento no es información
pública. Entregar una propiedad suelta es negocio corriente; entregar la que completa el
grupo ajeno cuesta una fracción de lo que gana el rival, y esa fracción es parte de la
personalidad.

La personalidad fija también cuánto insiste, cuándo contraoferta y cuánto rencor guarda.
Un trato que queda cerca del umbral se contraoferta en lugar de rechazarse, con un tope
de rondas por pareja para que dos bots no negocien indefinidamente y el turno nunca quede
detenido. La memoria de ofertas rechazadas se reconstruye desde el propio snapshot: la
política no guarda estado en el proceso, así que reiniciar el servidor no cambia ninguna
decisión.

Cada decisión viaja con su motivo. El ejecutor acepta un motivo automatizado y lo adjunta
a los eventos de intercambio que produjo ese comando, de modo que la bitácora explica por
qué un bot aceptó, rechazó o contraofertó. El motivo es un código que la interfaz traduce;
un bot de IA puede agregar además una frase propia, acotada y tratada como texto plano.

El ejecutor relee la partida antes de cada acción y entrega la secuencia observada
al comando. El bloqueo `SELECT ... FOR UPDATE` rechaza una decisión obsoleta si
otro proceso avanzó primero. Tras fallos repetidos intenta una acción conservadora
para destrabar la fase; como último recurso hace renunciar al bot. El ciclo se
reanuda al iniciar el servidor, limita acciones antes de ceder el procesador y
emite cada estado por Socket.IO.

La prueba de ciclo completo actúa como un cliente determinista: no modifica
snapshots ni filas directamente y solo envía comandos válidos hasta que queda un
ganador. El mismo escenario se ejecuta sobre los perímetros clásico y extendido
para detectar reglas que dependan accidentalmente de 40 o 64 posiciones.

Una simulación de mesa completa recorre además una partida solo de bots con dados
fijos y falla si alguna fase los deja sin jugada legal, si el motor rechaza un comando
propuesto o si un paso no produce eventos. Es la prueba que sostiene la promesa de que
la mesa avanza sin intervención humana, y la que expone de inmediato cualquier fase
nueva que los bots todavía no sepan resolver.

## Evolución prevista

1. Resolver por subasta la escasez simultánea de casas, si una expansión la exige.
2. Temporizadores opcionales definidos por paquetes de reglas.
3. Paquetes de reglas y expansiones instalables.
4. Consumidores de eventos para analítica e IA, sin acceso de escritura al motor.
