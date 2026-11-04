/** Listas sugeridas de infracciones y prendas (las mismas que carga la migración) */

export const SUGGESTED_INFRACTIONS: { emoji: string; name: string }[] = [
  { emoji: '😴', name: 'Levantarse tarde' },
  { emoji: '🥴', name: 'Terminar roto' },
  { emoji: '🕐', name: 'Llegar tarde' },
  { emoji: '📱', name: 'Estar con el celu en la mesa' },
  { emoji: '💸', name: 'No poner para la vaca' },
  { emoji: '🍕', name: 'Comerse la última porción sin preguntar' },
  { emoji: '💤', name: 'Dormirse en la previa' },
  { emoji: '🧹', name: 'No ayudar a limpiar' },
  { emoji: '👀', name: 'Clavar el visto en el grupo' },
  { emoji: '🎶', name: 'Poner un tema que nadie banca' },
]

export const SUGGESTED_FORFEITS: string[] = [
  'Lavar los platos de todos.',
  'Cebar mate a todos durante la mañana.',
  'Preparar el desayuno para el grupo.',
  'Ir a comprar el hielo (caminando).',
  'Usar un gorro ridículo durante una hora.',
  'Hablar en tercera persona durante 30 minutos.',
  'Cantar una canción que elija el grupo.',
  'Hacer 15 sentadillas delante de todos.',
  'Contestar todo con "sí, mi capitán" durante 20 minutos.',
  'Llevar las mochilas del grupo en la próxima salida.',
  'Pedir disculpas en forma de poema.',
  'Ordenar y limpiar el lugar donde paran.',
  'Bailar sin música durante 30 segundos.',
  'Ser el DJ obligatorio y aguantar los pedidos de todos por una hora.',
]

export const formatMoney = (amount: number) =>
  `${amount >= 0 ? '+' : '-'}$ ${Math.abs(amount).toLocaleString('es-AR')}`
