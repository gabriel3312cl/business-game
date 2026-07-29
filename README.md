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
- PostgreSQL con migraciones Alembic, snapshots y eventos append-only.
- Contrato validado para paquetes de tablero, reglas, mazos e i18n.
- Paquetes demostrativos de 40 y 64 casillas con nombres ficticios.
- Interfaz React/MUI con fichas sincronizadas, historial localizado, recuperación
  de la partida tras recargar, selector de tablero, zoom, sala, subastas,
  espectadores, intercambios y gestión de propiedades.

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
migraciones Alembic antes de iniciar. Para detener el stack sin borrar sus datos:

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
