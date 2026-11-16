/**
 * Efecto de "Quemar" dibujado en canvas:
 *  - pared de fuego con partículas de luz (mezcla aditiva) que sube desde abajo,
 *  - una lengua de fuego que trepa hasta la foto,
 *  - la foto se quema píxel a píxel desde abajo con un borde irregular que brilla,
 *    queda chamuscada y se deshace en cenizas que vuelan.
 */

export type BurnCard = { color: string; initials: string; name: string }

/** Momentos de la animación (segundos desde que aparece) */
export const BURN_TIMES = {
  stampBake: 1.75,
  tongue: 2.35,
  ignite: 3.1,
  burnDuration: 2.6,
  total: 7.4,
}

const CARD_W = 190
const CARD_H = 236

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  kind: 'fire' | 'spark' | 'ash' | 'smoke'
  seed: number
  rot: number
  vr: number
}

// ---------- Sprites de fuego ----------

function sprite(stops: [number, string][]) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  for (const [at, color] of stops) grad.addColorStop(at, color)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

let sprites: { hot: HTMLCanvasElement; warm: HTMLCanvasElement; red: HTMLCanvasElement; smoke: HTMLCanvasElement } | null = null
function getSprites() {
  if (!sprites) {
    sprites = {
      hot: sprite([[0, 'rgba(255,250,215,0.85)'], [0.25, 'rgba(255,215,100,0.7)'], [0.6, 'rgba(255,120,20,0.28)'], [1, 'rgba(255,70,0,0)']]),
      warm: sprite([[0, 'rgba(255,180,60,0.8)'], [0.35, 'rgba(255,100,15,0.5)'], [1, 'rgba(220,40,0,0)']]),
      red: sprite([[0, 'rgba(230,70,10,0.7)'], [0.45, 'rgba(160,20,0,0.35)'], [1, 'rgba(80,0,0,0)']]),
      smoke: sprite([[0, 'rgba(60,50,46,0.45)'], [0.5, 'rgba(45,38,35,0.2)'], [1, 'rgba(30,25,22,0)']]),
    }
  }
  return sprites
}

// ---------- Ruido para que el borde quemado sea irregular ----------

function valueNoise(w: number, h: number, cell: number, seed: number) {
  const gw = Math.ceil(w / cell) + 2
  const gh = Math.ceil(h / cell) + 2
  const grid = new Float32Array(gw * gh)
  let s = seed
  for (let i = 0; i < grid.length; i++) {
    s = (s * 16807) % 2147483647
    grid[i] = s / 2147483647
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const gy = y / cell
    const y0 = Math.floor(gy)
    const fy = gy - y0
    const sy = fy * fy * (3 - 2 * fy)
    for (let x = 0; x < w; x++) {
      const gx = x / cell
      const x0 = Math.floor(gx)
      const fx = gx - x0
      const sx = fx * fx * (3 - 2 * fx)
      const a = grid[y0 * gw + x0]
      const b = grid[y0 * gw + x0 + 1]
      const c = grid[(y0 + 1) * gw + x0]
      const d = grid[(y0 + 1) * gw + x0 + 1]
      out[y * w + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
    }
  }
  return out
}

// ---------- La foto (polaroid con el avatar) ----------

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function drawCard(g: CanvasRenderingContext2D, card: BurnCard, withStamp: boolean) {
  g.clearRect(0, 0, CARD_W, CARD_H)
  // Papel
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.55)'
  g.shadowBlur = 14
  g.shadowOffsetY = 6
  g.fillStyle = '#f6ead0'
  roundRect(g, 12, 8, 166, 208, 4)
  g.fill()
  g.restore()
  // Foto
  g.fillStyle = '#2a1a10'
  g.fillRect(24, 20, 142, 136)
  const grad = g.createRadialGradient(95, 60, 10, 95, 88, 90)
  grad.addColorStop(0, 'rgba(255,255,255,0.08)')
  grad.addColorStop(1, 'rgba(0,0,0,0.25)')
  g.fillStyle = grad
  g.fillRect(24, 20, 142, 136)
  // Avatar
  g.beginPath()
  g.arc(95, 88, 52, 0, Math.PI * 2)
  g.fillStyle = card.color
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = '#16110c'
  g.stroke()
  g.fillStyle = '#16110c'
  g.font = '800 44px "Barlow Condensed", "Arial Narrow", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(card.initials, 95, 91)
  // Nombre
  g.fillStyle = '#2a1d10'
  g.font = '34px "Caveat Brush", "Comic Sans MS", cursive'
  g.fillText(card.name.length > 12 ? `${card.name.slice(0, 11)}…` : card.name, 95, 186, 150)
  if (withStamp) {
    g.save()
    g.translate(95, 150)
    g.rotate((-14 * Math.PI) / 180)
    g.font = '27px "Alfa Slab One", Georgia, serif'
    const text = '¡QUEMADO!'
    const tw = g.measureText(text).width
    roundRect(g, -tw / 2 - 12, -21, tw + 24, 42, 6)
    g.fillStyle = 'rgba(246,234,208,0.85)'
    g.fill()
    g.lineWidth = 4
    g.strokeStyle = '#d42800'
    g.stroke()
    g.fillStyle = '#d42800'
    g.fillText(text, 0, 2)
    g.restore()
  }
}

// ---------- Motor ----------

type Options = {
  back: HTMLCanvasElement
  front: HTMLCanvasElement
  card: HTMLCanvasElement
  /** Sello del DOM: se oculta cuando se "imprime" en la foto */
  stamp: HTMLElement | null
  /** Lo que se sacude cuando prende fuego */
  cardWrap: HTMLElement | null
  info: BurnCard
  reducedMotion: boolean
  onIgnite?: () => void
}

export function startBurnFx(o: Options): () => void {
  const cardDpr = Math.min(window.devicePixelRatio || 1, 2)
  const fxDpr = Math.min(window.devicePixelRatio || 1, 1.5)
  const PW = Math.round(CARD_W * cardDpr)
  const PH = Math.round(CARD_H * cardDpr)

  // Foto base
  o.card.width = PW
  o.card.height = PH
  const cg = o.card.getContext('2d', { willReadFrequently: true })!
  const base = document.createElement('canvas')
  base.width = PW
  base.height = PH
  const bg = base.getContext('2d')!
  bg.scale(cardDpr, cardDpr)
  let stamped = false
  const paintBase = () => {
    drawCard(bg, o.info, stamped)
    cg.clearRect(0, 0, PW, PH)
    cg.drawImage(base, 0, 0)
  }
  paintBase()
  // Cuando terminan de cargar las letras, se vuelve a dibujar
  document.fonts?.ready.then(() => !burning && paintBase()).catch(() => undefined)

  if (o.reducedMotion) {
    stamped = true
    paintBase()
    if (o.stamp) o.stamp.style.visibility = 'hidden'
    return () => undefined
  }

  const backCtx = o.back.getContext('2d')!
  const frontCtx = o.front.getContext('2d')!
  const S = getSprites()
  let W = 0
  let H = 0
  const resize = () => {
    W = o.back.clientWidth
    H = o.back.clientHeight
    for (const c of [o.back, o.front]) {
      c.width = Math.round(W * fxDpr)
      c.height = Math.round(H * fxDpr)
      c.getContext('2d')!.setTransform(fxDpr, 0, 0, fxDpr, 0, 0)
    }
  }
  resize()
  window.addEventListener('resize', resize)

  // Mapa de quemado: arranca abajo al medio de la foto y avanza con borde irregular
  const ix = 95 * cardDpr
  const iy = 214 * cardDpr
  const far = Math.hypot(Math.max(ix, PW - ix), iy)
  const noise1 = valueNoise(PW, PH, 26 * cardDpr, 1234)
  const noise2 = valueNoise(PW, PH, 7 * cardDpr, 99)
  const burnMap = new Float32Array(PW * PH)
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x
      burnMap[i] = (Math.hypot(x - ix, y - iy) / far) * 0.74 + noise1[i] * 0.2 + noise2[i] * 0.06
    }
  }
  let baseData: ImageData | null = null
  const out = cg.createImageData(PW, PH)

  const back: Particle[] = []
  const front: Particle[] = []
  const add = (list: Particle[], p: Omit<Particle, 'age' | 'seed' | 'rot' | 'vr'> & Partial<Particle>) => {
    if (list.length > 1400) return
    list.push({ age: 0, seed: Math.random() * 100, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6, ...p })
  }

  /** De un punto de la foto (en px lógicos) a la pantalla, teniendo en cuenta que está girada */
  const cardToScreen = (lx: number, ly: number) => {
    const r = o.card.getBoundingClientRect()
    const host = o.front.getBoundingClientRect()
    const cx = r.left + r.width / 2 - host.left
    const cy = r.top + r.height / 2 - host.top
    const scale = o.card.offsetWidth ? (o.card.offsetWidth / CARD_W) : 1
    const a = (-4 * Math.PI) / 180
    const dx = (lx - CARD_W / 2) * scale
    const dy = (ly - CARD_H / 2) * scale
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) }
  }

  const start = performance.now()
  let last = start
  let raf = 0
  let burning = false
  let ignited = false
  let burnedOut = false
  let tongue = { x: 0, y: 0 }

  const T = BURN_TIMES

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = (now - start) / 1000
    const scale = Math.min(1.25, Math.max(0.7, H / 800))

    // --- El sello queda impreso en la foto ---
    if (!stamped && t >= T.stampBake) {
      stamped = true
      paintBase()
      if (o.stamp) o.stamp.style.visibility = 'hidden'
    }

    // --- Pared de fuego ---
    const intensity = Math.min(1, t / 0.7) * (t > T.total - 0.8 ? Math.max(0, (T.total - t) / 0.8) : 1)
    const count = Math.round(intensity * (W / 13) * (dt * 60))
    for (let k = 0; k < count; k++) {
      const big = Math.random() < 0.35
      add(back, {
        kind: 'fire',
        x: Math.random() * (W + 80) - 40,
        y: H + 20,
        vx: (Math.random() - 0.5) * 30,
        vy: -(170 + Math.random() * 230) * scale,
        life: 0.55 + Math.random() * 0.6,
        size: (big ? 70 + Math.random() * 60 : 35 + Math.random() * 35) * scale,
      })
    }
    // Chispas y humo
    if (Math.random() < intensity * 0.9) {
      add(front, {
        kind: 'spark',
        x: Math.random() * W,
        y: H - Math.random() * 60,
        vx: (Math.random() - 0.5) * 60,
        vy: -(220 + Math.random() * 260) * scale,
        life: 1.2 + Math.random() * 1.4,
        size: 1.5 + Math.random() * 2.5,
      })
    }
    if (Math.random() < intensity * 0.12) {
      add(back, {
        kind: 'smoke',
        x: Math.random() * W,
        y: H * 0.62,
        vx: (Math.random() - 0.5) * 20,
        vy: -(40 + Math.random() * 40),
        life: 2.5 + Math.random() * 1.5,
        size: (120 + Math.random() * 120) * scale,
      })
    }

    // --- Lengua de fuego que trepa hasta la foto ---
    if (t >= T.tongue && t < T.ignite + 0.25) {
      const target = cardToScreen(95, 214)
      const p = Math.min(1, (t - T.tongue) / (T.ignite - T.tongue))
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      const sway = Math.sin(t * 9) * 18 * (1 - p)
      tongue = { x: W / 2 + (target.x - W / 2) * e + sway, y: H + 10 + (target.y - (H + 10)) * e }
      // La punta y un cuerpo que la sigue desde abajo
      for (let k = 0; k < 16; k++) {
        const back = Math.random() * Math.random() * 160
        add(front, {
          kind: 'fire',
          x: tongue.x + (Math.random() - 0.5) * (22 + back * 0.25),
          y: tongue.y + back,
          vx: (Math.random() - 0.5) * 50,
          vy: -(140 + Math.random() * 140),
          life: 0.3 + Math.random() * 0.35,
          size: (40 + Math.random() * 46) * scale * (1 - back / 400),
        })
      }
    }

    // --- Prende fuego la foto ---
    if (!ignited && t >= T.ignite) {
      ignited = true
      burning = true
      baseData = cg.getImageData(0, 0, PW, PH)
      const at = cardToScreen(95, 214)
      for (let k = 0; k < 50; k++) {
        const a = Math.random() * Math.PI * 2
        const v = 120 + Math.random() * 280
        add(front, { kind: 'spark', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.6 + Math.random() * 0.8, size: 1.5 + Math.random() * 2.5 })
      }
      o.cardWrap?.classList.add('is-burning')
      o.onIgnite?.()
    }

    if (burning && baseData) {
      const p = Math.min(1, (t - T.ignite) / T.burnDuration)
      const th = -0.04 + Math.pow(p, 0.85) * 1.16
      const flicker = 0.85 + Math.random() * 0.15
      const src = baseData.data
      const dst = out.data
      let alive = 0
      for (let i = 0, j = 0; i < burnMap.length; i++, j += 4) {
        const a = src[j + 3]
        if (a === 0) {
          dst[j + 3] = 0
          continue
        }
        const d = th - burnMap[i]
        if (d > 0.08) {
          dst[j + 3] = 0
        } else if (d > 0.048) {
          // Borde de ceniza que se deshace
          const k = (d - 0.048) / 0.032
          dst[j] = 30
          dst[j + 1] = 22
          dst[j + 2] = 18
          dst[j + 3] = a * (1 - k)
          alive++
        } else if (d > 0) {
          // Línea de fuego: amarilla adelante, roja atrás
          const k = d / 0.048
          dst[j] = 255 * flicker
          dst[j + 1] = (225 - 190 * k) * flicker
          dst[j + 2] = (120 - 120 * k) * flicker
          dst[j + 3] = a
          alive++
        } else if (d > -0.1) {
          // Papel chamuscado
          const f = Math.pow(1 + d / 0.1, 1.6)
          dst[j] = src[j] * (1 - 0.85 * f) + 70 * f
          dst[j + 1] = src[j + 1] * (1 - 0.9 * f) + 22 * f
          dst[j + 2] = src[j + 2] * (1 - 0.95 * f) + 6 * f
          dst[j + 3] = a
          alive++
        } else {
          dst[j] = src[j]
          dst[j + 1] = src[j + 1]
          dst[j + 2] = src[j + 2]
          dst[j + 3] = a
          alive++
        }
      }
      cg.putImageData(out, 0, 0)

      // Llamitas y cenizas que salen del borde que se está quemando
      for (let k = 0; k < 90; k++) {
        const i = (Math.random() * burnMap.length) | 0
        if (src[i * 4 + 3] === 0) continue
        const d = th - burnMap[i]
        if (d <= 0 || d > 0.07) continue
        const pt = cardToScreen((i % PW) / cardDpr, Math.floor(i / PW) / cardDpr)
        if (d < 0.04 && Math.random() < 0.55) {
          add(front, { kind: 'fire', x: pt.x, y: pt.y, vx: (Math.random() - 0.5) * 30, vy: -(60 + Math.random() * 110), life: 0.3 + Math.random() * 0.35, size: (16 + Math.random() * 22) * scale })
        } else if (Math.random() < 0.6) {
          add(front, { kind: 'ash', x: pt.x, y: pt.y, vx: (Math.random() - 0.5) * 50, vy: -(30 + Math.random() * 90), life: 1.6 + Math.random() * 1.8, size: 2 + Math.random() * 4.5 })
        }
      }
      if (alive === 0 || p >= 1) {
        burning = false
        burnedOut = true
        cg.clearRect(0, 0, PW, PH)
      }
    }
    if (burnedOut && o.cardWrap && !o.cardWrap.classList.contains('is-gone')) o.cardWrap.classList.add('is-gone')

    // --- Dibujar ---
    for (const [ctx, list] of [[backCtx, back], [frontCtx, front]] as const) {
      ctx.clearRect(0, 0, W, H)
      for (let n = list.length - 1; n >= 0; n--) {
        const q = list[n]
        q.age += dt
        if (q.age >= q.life) {
          list.splice(n, 1)
          continue
        }
        if (q.kind === 'fire') {
          q.vx += Math.sin(t * 4 + q.seed) * 40 * dt
          q.vy *= 1 - 0.4 * dt
        } else if (q.kind === 'ash') {
          q.vx += Math.sin(t * 2 + q.seed) * 60 * dt
          q.vy += 8 * dt
          q.rot += q.vr * dt
        } else if (q.kind === 'spark') {
          q.vx += Math.sin(t * 6 + q.seed) * 50 * dt
          q.vy += 60 * dt
        }
        q.x += q.vx * dt
        q.y += q.vy * dt
      }
    }
    backCtx.globalCompositeOperation = 'source-over'
    for (const q of back) if (q.kind === 'smoke') {
      const life = q.age / q.life
      const s = q.size * (0.6 + life)
      backCtx.globalAlpha = Math.sin(life * Math.PI) * 0.6
      backCtx.drawImage(S.smoke, q.x - s / 2, q.y - s / 2, s, s)
    }
    for (const ctx of [backCtx, frontCtx]) {
      const list = ctx === backCtx ? back : front
      ctx.globalCompositeOperation = 'lighter'
      for (const q of list) {
        const life = q.age / q.life
        if (q.kind === 'fire') {
          const s = q.size * (1 - life * 0.75)
          const img = life < 0.3 ? S.hot : life < 0.65 ? S.warm : S.red
          ctx.globalAlpha = Math.min(1, (1 - life) * 1.4) * (ctx === backCtx ? 0.62 : 0.85)
          ctx.drawImage(img, q.x - s / 2, q.y - s / 2, s, s)
        } else if (q.kind === 'spark') {
          ctx.globalAlpha = 1 - life
          const s = q.size * 4
          ctx.drawImage(S.hot, q.x - s / 2, q.y - s / 2, s, s)
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      for (const q of list) {
        if (q.kind !== 'ash') continue
        const life = q.age / q.life
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.rot)
        ctx.globalAlpha = (1 - life) * 0.95
        // Recién desprendida brilla naranja; después es gris
        ctx.fillStyle = life < 0.18 ? '#ff9a3c' : life < 0.35 ? '#7a3b1c' : '#3a3330'
        ctx.fillRect(-q.size / 2, -q.size / 3, q.size, q.size * 0.66)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }

    if (t < T.total + 0.6) raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
  }
}
