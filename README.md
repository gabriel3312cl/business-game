# Business Game

Base modular para un juego multijugador de compraventa de propiedades.

El proyecto separa tres conceptos que no deben mezclarse:

- **Motor:** turnos, comandos, eventos y reglas autoritativas.
- **Paquetes de contenido:** tablero, propiedades, precios y traducciones.
- **Presentación:** React y Material UI, incluido el tablero clásico o extendido.

## Estado actual

Esta primera entrega contiene:

- API FastAPI con CRUD básico de usuarios.
- Registro e inicio de sesión con JWT y contraseñas Argon2.
- Sesiones persistentes y revocables mediante cookie HttpOnly, con renovación
  automática del token de acceso.
- Salas configurables con límite de jugadores, espectadores de solo lectura,
  transferencia de anfitrión, salida del lobby y renuncia durante una partida.
- Secuencia jugable: entrar, iniciar, lanzar dados, comprar y terminar turno.
- Subastas autoritativas con pujas vinculantes y cierre por pases.
- Intercambios de dinero y propiedades, revalidados de forma atómica al aceptar.
- Rentas, impuestos y deudas que deben resolverse antes de continuar el turno.
- Hipotecas, casas y hoteles con construcción pareja e inventario limitado.
- Dobles, detención, pago de salida y cartas para conservar o usar más tarde.
- Mazos persistentes con efectos de dinero, movimiento y envío a detención.
- Cartas con movimiento relativo o al destino más cercano, reparaciones y pagos
  encadenados entre jugadores.
- Reglas opcionales por paquete para subastas, pozo en Descanso y salario doble
  al caer en Salida.
- Bancarrota con transferencia al acreedor o subastas bancarias encadenadas.
- Socket.IO sobre ASGI para sincronización en tiempo real.
- Bots autoritativos con perfiles conservador, equilibrado, agresivo y negociador;
  compran, construyen, subastan, resuelven deudas e intercambian mediante los
  mismos comandos validados que los jugadores humanos.
- Negociación real entre bots: proponen cambios que completan grupos a ambas partes,
  ponen precio a lo que gana el rival, contraofertan cuando el trato queda cerca y se
  niegan a entregar la pieza que cierra un grupo ajeno; la bitácora muestra el motivo
  de cada respuesta.
- Asesor estratégico de solo lectura con preguntas adaptadas al estado de la
  partida y sin acceso a comandos del motor.
- PostgreSQL con migraciones Alembic, snapshots y eventos append-only.
- Contrato validado para paquetes de tablero, reglas, mazos e i18n.
- Paquetes demostrativos de 40 y 64 casillas con nombres ficticios.
- Creador visual de tableros cuadrados de 5×5 a 30×30. Un tablero N×N
  contiene `4N - 4` casillas porque las cuatro esquinas son compartidas:
  10×10 genera 36 casillas y 30×30 genera 116.
- Borradores privados persistentes con guardado por revisión, validación cruzada,
  versiones publicadas inmutables y selección del paquete publicado al crear una
  partida.
- Edición de economía, grupos, propiedades, transportes, servicios, esquinas,
  mazos y efectos declarativos de cartas o casillas, sin ejecutar código
  proporcionado por el usuario.
- Interfaz React/MUI responsive con el tablero como área central, fichas
  sincronizadas, recuperación de la partida tras recargar o reconectar, railes
  laterales en escritorio y paneles inferiores en móvil.
- Dados 3D, movimiento de fichas casilla por casilla y acciones de aterrizaje
  reveladas solamente cuando termina la animación visible.

## Desarrollo

Requisitos: Python 3.12+, `uv`, Node.js 20+ y pnpm.

```bash
cd backend
uv sync --dev
uv run alembic upgrade head
uv run uvicorn business_game.main:app --reload --host 127.0.0.1 --port 48010
```

En otra terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

API: `http://127.0.0.1:48010`
Frontend: `http://127.0.0.1:43173`

Los puertos de desarrollo están separados de otros proyectos locales:

- Frontend: `43173`
- API y Socket.IO: `48010`
- PostgreSQL: `45432`
- Redis: `46379`

Todos se publican solamente en `127.0.0.1`. Vite usa `strictPort`, por lo que
no cambiará silenciosamente de puerto si alguno está ocupado.

La aplicación completa se puede construir e iniciar con Docker:

```bash
make stack
```

Esto levanta el frontend, la API, PostgreSQL y Redis. La API ejecuta las
migraciones Alembic antes de iniciar. En desarrollo, el frontend usa Vite con
recarga automática y la API se reinicia al cambiar archivos de `backend/src` o
`content`.

Si cambias dependencias, Dockerfiles o la configuración de Compose, reconstruye
y recrea los contenedores sin borrar PostgreSQL ni Redis:

```bash
make refresh
```

Para detener el stack sin borrar sus datos:

```bash
make stack-down
```

Si solo necesitas PostgreSQL y Redis para desarrollar en el host:

```bash
make infrastructure
make migrate
```

Compose usa el proyecto `business-game`, la red `business-game-internal` y
volúmenes con prefijo `business-game-`. No declara `container_name`, por lo que
no puede apropiarse de nombres globales de otros proyectos. Todos los puertos se
publican exclusivamente en `127.0.0.1`; si alguno ya está ocupado, Docker o Vite
detendrán el arranque en vez de elegir otro en silencio.

La configuración local parte desde el contrato versionado y se guarda en un
archivo `.env` ignorado por Git:

```bash
cp .env.example .env
# Edita BUSINESS_GAME_DEEPSEEK_API_KEY en .env
make stack
```

Modelo, URL, timeout y límite por usuario también se configuran en `.env`; no
están fijados en el código. La clave nunca se envía al navegador. El backend
entrega al modelo un resumen seudonimizado de la partida y no expone al asesor
ningún comando capaz de modificar el juego. Mientras la clave esté vacía, el
resto del juego funciona y el asesor responde como no disponible.

## Validación

La regresión de ciclo completo ejecuta partidas deterministas en los paquetes
clásico y extendido. Solo usa los comandos públicos del motor y exige terminar
con un ganador, secuencias de eventos continuas y sin deudas ni subastas
pendientes.

```bash
cd backend
uv run pytest
uv run ruff check .

cd ../frontend
pnpm lint
pnpm build
```

Los paquetes demostrativos se regeneran con:

```bash
uv run python ../tools/generate_demo_packs.py
```
