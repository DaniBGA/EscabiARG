/** Foto de mentira para la sala de práctica (así no hace falta la cámara) */
const SCENES = [
  { emoji: '🍺', from: '#f2a71b', to: '#9a5d05' },
  { emoji: '🥃', from: '#c76b2b', to: '#5a2410' },
  { emoji: '🍸', from: '#5ec8c4', to: '#1d5f6b' },
  { emoji: '🤪', from: '#8a5cf6', to: '#3b1d7a' },
]
let next = 0

export function samplePhoto(): Promise<Blob> {
  const scene = SCENES[next++ % SCENES.length]
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 720
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 720, 720)
  g.addColorStop(0, scene.from)
  g.addColorStop(1, scene.to)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 720, 720)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '300px system-ui, sans-serif'
  ctx.fillText(scene.emoji, 360, 330)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.fillText('Foto de práctica', 360, 610)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PHOTO_FAILED'))), 'image/jpeg', 0.85),
  )
}
