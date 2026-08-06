# Biblioteca de audio aprobada · Selección final

Esta carpeta sigue aislada del juego. Ningún audio está conectado a eventos ni componentes de producción.

La cuarta ronda cerró con 50 decisiones:

- 47 sonidos aprobados en las rondas anteriores.
- `Ficha metálica · Contacto suave` aprobada para el movimiento.
- Los otros 2 matices metálicos rechazados.
- 0 pistas musicales.

Cada matiz permite escuchar un contacto aislado y una demostración de seis casillas. Las demostraciones alternan cuatro tomas reales para evitar una repetición mecánica. La página `index.html` permite aprobar, rechazar, escribir comentarios y exportar el resultado como JSON.

Para abrirla desde un servidor local:

```sh
python3 -m http.server 4174 --directory audio-review
```

Luego abre `http://localhost:4174`.

Los audios nuevos están en WAV estéreo de 44,1 kHz y 16 bits. Sus peaks están entre 0,48 y 0,60 para conservar una sensación cercana y agradable, sin golpes estridentes. Se conservará WAV durante la revisión; la conversión al formato final se realizará después de la aprobación.

Los feedbacks completos de las rondas 2, 3 y 4 están archivados en `archive/round2/`, `archive/round3/` y `archive/round4/`. Los assets definitivos optimizados están integrados en `frontend/public/audio/`.

Consulta `SOURCES.md` antes de distribuir los archivos.
