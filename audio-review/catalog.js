window.AUDIO_CANDIDATES = [
  { id: 'dice-roll-a', group: 'Dados y movimiento', event: 'Lanzamiento de dados A', file: 'sfx-v2/dice-roll-a.wav', style: 'Rodado natural de 2,4 segundos que acompaña la animación', source: 'Composición R2 · OpenGameArt + Kenney' },
  { id: 'dice-roll-b', group: 'Dados y movimiento', event: 'Lanzamiento de dados B', file: 'sfx-v2/dice-roll-b.wav', style: 'Alternativa natural más corta, con caída final', source: 'Composición R2 · OpenGameArt + Kenney' },
  { id: 'dice-doubles', group: 'Dados y movimiento', event: 'Dobles', file: 'sfx/dice-doubles.ogg', style: 'Agitación breve de dados', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'token-step-metal-soft', group: 'Dados y movimiento', event: 'Ficha metálica · Contacto suave', file: 'sfx-v4/token-step-metal-soft-1.wav', previewFile: 'sfx-v4/token-preview-metal-soft.wav', style: 'Metal real sobre madera, cercano y redondeado; el menos fatigante', source: 'Edición R4 · grabación CC0 de Breviceps' },
  { id: 'token-step-metal-slide', group: 'Dados y movimiento', event: 'Ficha metálica · Microdeslizamiento', file: 'sfx-v4/token-step-metal-slide-1.wav', previewFile: 'sfx-v4/token-preview-metal-slide.wav', style: 'Contacto suave seguido de una textura mínima de metal sobre madera', source: 'Edición R4 · grabaciones CC0 de Breviceps y Colonnades' },
  { id: 'token-step-metal-crisp', group: 'Dados y movimiento', event: 'Ficha metálica · Contacto nítido', file: 'sfx-v4/token-step-metal-crisp-1.wav', previewFile: 'sfx-v4/token-preview-metal-crisp.wav', style: 'Golpe metálico natural un poco más definido, sin efectos añadidos', source: 'Edición R4 · grabación CC0 de Breviceps' },
  { id: 'token-teleport', group: 'Dados y movimiento', event: 'Movimiento instantáneo', file: 'sfx/token-teleport.ogg', style: 'Barrido electrónico corto', source: 'Conservado de ronda 1', initialVote: 'approved' },

  { id: 'turn-yours', group: 'Turnos y tarjetas', event: 'Tu turno', file: 'sfx/turn-yours.ogg', style: 'Confirmación clara y breve', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'turn-extra-roll', group: 'Turnos y tarjetas', event: 'Turno adicional', file: 'sfx/turn-extra-roll.ogg', style: 'Confirmación ascendente', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'card-draw', group: 'Turnos y tarjetas', event: 'Sacar tarjeta', file: 'sfx/card-draw.ogg', style: 'Carta deslizándose', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'card-positive', group: 'Turnos y tarjetas', event: 'Tarjeta positiva', file: 'sfx/card-positive.ogg', style: 'Remate musical de pizzicato', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'card-negative', group: 'Turnos y tarjetas', event: 'Tarjeta negativa', file: 'sfx/card-negative.ogg', style: 'Remate musical descendente', source: 'Conservado de ronda 1', initialVote: 'approved' },

  { id: 'property-purchase', group: 'Propiedades y dinero', event: 'Comprar propiedad', file: 'sfx-v2/property-purchase.wav', style: 'Caja registradora, monedas y confirmación alegre', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'property-declined', group: 'Propiedades y dinero', event: 'Rechazar propiedad', file: 'sfx/property-declined.ogg', style: 'Carta retirada de la mesa', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'payment-sent', group: 'Propiedades y dinero', event: 'Realizar pago', file: 'sfx-v2/payment-sent.wav', style: 'Dinero que sale con remate descendente', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'payment-received', group: 'Propiedades y dinero', event: 'Recibir pago', file: 'sfx-v2/payment-received.wav', style: 'Monedas y premio ascendente', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'salary-collected', group: 'Propiedades y dinero', event: 'Cobrar salario', file: 'sfx-v2/salary-collected.wav', style: 'Pago abundante y fanfarria de caja', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'building-house', group: 'Propiedades y dinero', event: 'Construir casa', file: 'sfx-v2/building-house.wav', style: 'Sierra, martillos y remate de obra terminada', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'building-hotel', group: 'Propiedades y dinero', event: 'Construir hotel', file: 'sfx-v2/building-hotel.wav', style: 'Taladro, metal, madera y final tecnológico', source: 'Composición R2 · Mixkit' },
  { id: 'building-sold', group: 'Propiedades y dinero', event: 'Vender construcción', file: 'sfx-v2/building-sold.wav', style: 'Retiro de pieza seguido de caja registradora', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'property-mortgaged', group: 'Propiedades y dinero', event: 'Hipotecar propiedad', file: 'sfx-v2/property-mortgaged.wav', style: 'Cajero, cerradura bancaria y acorde grave', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'property-unmortgaged', group: 'Propiedades y dinero', event: 'Levantar hipoteca', file: 'sfx-v2/property-unmortgaged.wav', style: 'Cerradura abierta, dinero y campanas felices', source: 'Composición R2 · Mixkit' },

  { id: 'auction-start', group: 'Subastas', event: 'Iniciar subasta', file: 'sfx-v2/auction-start.wav', style: 'Dos martillazos y anuncio de apertura', source: 'Composición R2 · Mixkit' },
  { id: 'auction-bid', group: 'Subastas', event: 'Nueva oferta', file: 'sfx-v2/auction-bid.wav', style: 'Monedas con campana de nueva puja', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'auction-countdown', group: 'Subastas', event: 'Últimos segundos', file: 'sfx-v2/auction-countdown.wav', style: 'Cuenta regresiva que termina en alarma', source: 'Composición R2 · Mixkit' },
  { id: 'auction-completed', group: 'Subastas', event: 'Ganaste la subasta', file: 'sfx-v2/auction-completed.wav', style: 'Martillo final, público y felicitación', source: 'Composición R2 · Mixkit' },
  { id: 'auction-lost', group: 'Subastas', event: 'Perdiste la subasta', file: 'sfx-v2/auction-lost.wav', style: 'Martillo final con decepción amable', source: 'Composición R2 · Mixkit + síntesis original' },

  { id: 'trade-proposed', group: 'Intercambios', event: 'Proponer intercambio', file: 'sfx/trade-proposed.ogg', style: 'Consulta electrónica elegante', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'trade-accepted', group: 'Intercambios', event: 'Aceptar intercambio', file: 'sfx-v2/trade-accepted.wav', style: 'Felicitación breve con aplausos', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'trade-rejected', group: 'Intercambios', event: 'Rechazar intercambio', file: 'sfx-v2/trade-rejected.wav', style: 'Piano negativo y golpe grave', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'trade-cancelled', group: 'Intercambios', event: 'Cancelar intercambio', file: 'sfx-v2/trade-cancelled.wav', style: 'Barrido de cancelación y cierre', source: 'Composición R2 · Mixkit + síntesis original' },

  { id: 'jail-entered', group: 'Cárcel y deudas', event: 'Entrar a la cárcel', file: 'sfx-v2/jail-entered.wav', style: 'Puerta de prisión, rejas y resonancia metálica', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'jail-roll-failed', group: 'Cárcel y deudas', event: 'Fallar salida de la cárcel', file: 'sfx-v2/jail-roll-failed.wav', style: 'Decepción cómica seguida de reja', source: 'Composición R2 · Mixkit' },
  { id: 'jail-released', group: 'Cárcel y deudas', event: 'Salir de la cárcel', file: 'sfx/jail-released.ogg', style: 'Puerta o reja abriéndose', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'tax-or-repairs', group: 'Cárcel y deudas', event: 'Impuestos o reparaciones', file: 'sfx-v2/tax-or-repairs.wav', style: 'Dinero perdido con mala suerte cómica', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'debt-created', group: 'Cárcel y deudas', event: 'Crear deuda', file: 'sfx-v2/debt-created.wav', style: 'Cajero, monedas y pulso de espera', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'debt-paid', group: 'Cárcel y deudas', event: 'Pagar deuda', file: 'sfx-v2/debt-paid.wav', style: 'Transacción monetaria confirmada', source: 'Composición R2 · Mixkit' },
  { id: 'free-parking-collected', group: 'Cárcel y deudas', event: 'Cobrar estacionamiento libre', file: 'sfx/free-parking-collected.ogg', style: 'Premio musical contenido', source: 'Conservado de ronda 1', initialVote: 'approved' },

  { id: 'player-bankrupt', group: 'Partida y sistema', event: 'Bancarrota o rendición', file: 'sfx-v2/player-bankrupt.wav', style: 'Piano, público decepcionado y caída final', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'game-started', group: 'Partida y sistema', event: 'Inicio de partida', file: 'sfx/game-started.ogg', style: 'Nuevo comienzo animoso', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'game-finished', group: 'Partida y sistema', event: 'Fin de partida', file: 'sfx-v2/game-finished.wav', style: 'Campanas descendentes y cierre de jornada', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'action-rejected', group: 'Partida y sistema', event: 'Acción rechazada', file: 'sfx-v2/action-rejected.wav', style: 'Error corto y contundente', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'connection-lost', group: 'Partida y sistema', event: 'Conexión perdida', file: 'sfx-v2/connection-lost.wav', style: 'Glitch y caída digital', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'connection-restored', group: 'Partida y sistema', event: 'Conexión recuperada', file: 'sfx/connection-restored.ogg', style: 'Confirmación clara', source: 'Conservado de ronda 1', initialVote: 'approved' },
  { id: 'ui-important-click', group: 'Partida y sistema', event: 'Aviso importante', file: 'sfx-v2/ui-important-click.wav', style: 'Aviso nostálgico original de dos notas', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'player-joined', group: 'Partida y sistema', event: 'Jugador entra', file: 'sfx-v2/player-joined.wav', style: 'Silla que se acomoda y saludo discreto', source: 'Composición R2 · Mixkit + síntesis original' },
  { id: 'player-left', group: 'Partida y sistema', event: 'Jugador sale', file: 'sfx-v2/player-left.wav', style: 'Puerta cerrándose con despedida', source: 'Composición R2 · Mixkit + síntesis original' },

  { id: 'chat-message', group: 'Chat y asesor', event: 'Mensaje de chat', file: 'sfx-v2/chat-message.wav', style: 'Mensaje alegre con aire de mensajería clásica', source: 'Composición R2 original, sin copiar marcas' },
  { id: 'chat-mention', group: 'Chat y asesor', event: 'Mención en chat', file: 'sfx-v2/chat-mention.wav', style: 'Campana social brillante y juguetona', source: 'Composición R2 original, sin copiar marcas' },
  { id: 'advisor-response', group: 'Chat y asesor', event: 'Respuesta del asesor', file: 'sfx-v2/advisor-response.wav', style: 'Barrido tecnológico, datos y respuesta', source: 'Composición R2 · Mixkit + síntesis original' },
]

const AUDIO_ROUND_1_APPROVED = new Set([
  'dice-doubles',
  'token-teleport',
  'turn-yours',
  'turn-extra-roll',
  'card-draw',
  'card-positive',
  'card-negative',
  'property-declined',
  'trade-proposed',
  'jail-released',
  'free-parking-collected',
  'game-started',
  'connection-restored',
])

window.AUDIO_CANDIDATES.forEach((item) => {
  if (item.id.startsWith('token-step-')) {
    item.round = 4
    return
  }
  item.initialVote = 'approved'
  item.round = AUDIO_ROUND_1_APPROVED.has(item.id) ? 1 : 2
})
