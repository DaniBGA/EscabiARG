/**
 * Animación del vaso de cerveza en <canvas>: canilla, chorro con caída,
 * espuma que se forma mientras se sirve, burbujas de gas en hileras,
 * salpicaduras y gotas de condensación sobre el vidrio.
 */

type Options = {
  onProgress?: (p: number) => void
  onFilled?: () => void
  /** Arranca directamente lleno */
  instant?: boolean
  /** Sin animación: dibuja el vaso lleno una sola vez */
  reducedMotion?: boolean
}

type Bubble = {
  baseX: number
  y: number
  vy: number
  ay: number
  r0: number
  phase: number
  wobble: number
  age: number
}

type Site = { x: number; next: number; every: number; r: number }

type Splash = { x: number; y: number; vx: number; vy: number; r: number }

type Drop = {
  x: number
  y: number
  r: number
  stretch: number
  coveredAt: number | null
  slide: { v: number; until: number; startY: number; stoppedAt: number | null } | null
}

type Frame = {
  p: number
  tapBottom: number
  streamTop: number
  streamBottom: number
  pouring: boolean
  hitting: boolean
  impactAmp: number
  done: boolean
}

const TAU = Math.PI * 2
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2)
/** Sirve rápido al principio y frena al final (como cuando se "completa" el vaso) */
const fillCurve = (t: number) => 1 - Math.pow(1 - t, 1.8)

// Línea de tiempo (ms)
const TAP_IN = 420
const STREAM_START = 300
const STREAM_FALL = 380
const FILL_START = STREAM_START + STREAM_FALL
const FILL = 3600
const FILL_END = FILL_START + FILL
const DONE_AT = FILL_END + 450
const SKIP_TO = DONE_AT + 2500

const STEP = 6 // resolución horizontal de las superficies (px)
const FOAM_TOP_FINAL = 10 // la espuma termina casi al borde superior
const TAP_HEIGHT = 68 // alto de la canilla a escala 1

export class BeerRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private opts: Options

  private w = 0
  private h = 0
  private dpr = 1
  private s = 1 // escala general según ancho de pantalla
  private foamH = 0

  private start = 0
  private raf = 0
  private lastFrame = 0
  private lastDraw = 0
  private lastProgress = -1
  private filledFired = false
  private time = 0

  private sites: Site[] = []
  private bubbles: Bubble[] = []
  private splashes: Splash[] = []
  private drops: Drop[] = []
  private nextSlide = 0

  private foamTopBase = 0
  private xs: number[] = []
  private topYs: number[] = []
  private intYs: number[] = []

  private foamTex: HTMLCanvasElement | null = null
  private lacing: { x: number; dy: number; r: number }[] = []
  private seeds = [rand(0, 100), rand(0, 100), rand(0, 100), rand(0, 100)]

  // Gradientes que solo dependen del tamaño
  private gBackground!: CanvasGradient
  private gSideShade!: CanvasGradient
  private gGlassLeft!: CanvasGradient
  private gGlassRight!: CanvasGradient
  private gStream!: CanvasGradient
  private gChrome!: CanvasGradient

  constructor(canvas: HTMLCanvasElement, opts: Options = {}) {
    this.canvas = canvas
    this.opts = opts
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D no disponible')
    this.ctx = ctx

    this.resize()
    window.addEventListener('resize', this.resize)

    if (opts.instant || opts.reducedMotion) this.jumpToEnd(performance.now())

    if (opts.reducedMotion) {
      this.drawStatic()
    } else {
      this.raf = requestAnimationFrame(this.frame)
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
  }

  /** Saltea la animación y deja el vaso lleno */
  skip() {
    this.jumpToEnd(performance.now())
  }

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    this.w = Math.max(1, rect.width || window.innerWidth)
    this.h = Math.max(1, rect.height || window.innerHeight)
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.s = clamp(this.w / 420, 0.85, 1.35)
    this.foamH = clamp(this.h * 0.2, 90, 190)

    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    // El login usa este valor para dejar lugar a la espuma
    this.canvas.parentElement?.style.setProperty('--foam-h', `${this.foamH}px`)

    this.xs = []
    for (let x = -STEP; x <= this.w + STEP; x += STEP) this.xs.push(x)
    this.topYs = new Array(this.xs.length).fill(this.h)
    this.intYs = new Array(this.xs.length).fill(this.h)

    this.buildGradients()
    this.buildSites()
    this.buildDrops()
    this.buildFoamTexture()

    if (this.opts.reducedMotion && this.filledFired) this.drawStatic()
  }

  private buildGradients() {
    const { ctx, w, h, s } = this
    const cx = w / 2

    const bg = ctx.createRadialGradient(cx, h * 0.28, 0, cx, h * 0.28, Math.max(w, h) * 0.9)
    bg.addColorStop(0, '#3d2616')
    bg.addColorStop(0.55, '#1a0f08')
    bg.addColorStop(1, '#0b0603')
    this.gBackground = bg

    const side = ctx.createLinearGradient(0, 0, w, 0)
    side.addColorStop(0, 'rgba(60, 20, 0, 0.42)')
    side.addColorStop(0.16, 'rgba(60, 20, 0, 0)')
    side.addColorStop(0.84, 'rgba(60, 20, 0, 0)')
    side.addColorStop(1, 'rgba(60, 20, 0, 0.42)')
    this.gSideShade = side

    const gl = ctx.createLinearGradient(w * 0.05, 0, w * 0.14, 0)
    gl.addColorStop(0, 'rgba(255, 255, 255, 0)')
    gl.addColorStop(0.45, 'rgba(255, 255, 255, 0.1)')
    gl.addColorStop(0.6, 'rgba(255, 255, 255, 0.05)')
    gl.addColorStop(1, 'rgba(255, 255, 255, 0)')
    this.gGlassLeft = gl

    const gr = ctx.createLinearGradient(w * 0.86, 0, w * 0.89, 0)
    gr.addColorStop(0, 'rgba(255, 255, 255, 0)')
    gr.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)')
    gr.addColorStop(1, 'rgba(255, 255, 255, 0)')
    this.gGlassRight = gr

    const half = 12 * s
    const st = ctx.createLinearGradient(cx - half, 0, cx + half, 0)
    st.addColorStop(0, '#a85800')
    st.addColorStop(0.22, '#ee9f1c')
    st.addColorStop(0.45, '#ffe08a')
    st.addColorStop(0.62, '#f7b52c')
    st.addColorStop(1, '#a85800')
    this.gStream = st

    const cw = 30 * s
    const ch = ctx.createLinearGradient(cx - cw, 0, cx + cw, 0)
    ch.addColorStop(0, '#4f4f4f')
    ch.addColorStop(0.18, '#cfcfcf')
    ch.addColorStop(0.34, '#ffffff')
    ch.addColorStop(0.55, '#8d8d8d')
    ch.addColorStop(0.78, '#e2e2e2')
    ch.addColorStop(1, '#5a5a5a')
    this.gChrome = ch
  }

  /** Puntos de nucleación: de ahí salen las hileras de burbujas */
  private buildSites() {
    const n = Math.round(clamp(this.w / 34, 8, 24))
    this.sites = Array.from({ length: n }, () => ({
      x: rand(this.w * 0.04, this.w * 0.96),
      next: 0,
      every: rand(130, 520),
      r: rand(0.9, 2.1) * this.s,
    }))
  }

  private buildDrops() {
    const n = Math.round(clamp((this.w * this.h) / 6500, 25, 110))
    const finished = this.filledFired
    this.drops = Array.from({ length: n }, () => {
      const k = Math.random()
      const r = (k < 0.7 ? rand(1, 2.6) : k < 0.93 ? rand(2.6, 5) : rand(5, 8.5)) * this.s
      return {
        x: rand(0, this.w),
        y: rand(this.foamH * 0.6, this.h),
        r,
        stretch: rand(1, 1.25),
        coveredAt: finished ? -1e9 : null,
        slide: null,
      }
    })
  }

  /** Textura de burbujitas de la espuma (se dibuja una sola vez) */
  private buildFoamTexture() {
    const texW = Math.ceil(this.w)
    const texH = Math.ceil(this.foamH + 80)
    const tex = document.createElement('canvas')
    tex.width = Math.round(texW * this.dpr)
    tex.height = Math.round(texH * this.dpr)
    const c = tex.getContext('2d')
    if (!c) return
    c.scale(this.dpr, this.dpr)

    // Motitas finas
    c.fillStyle = 'rgba(205, 168, 98, 0.16)'
    for (let i = 0; i < (texW * texH) / 40; i++) {
      c.fillRect(Math.random() * texW, Math.random() * texH, 1, 1)
    }

    // Burbujas: más grandes arriba (la espuma vieja se agranda), finas abajo
    const count = (texW * texH) / 70
    for (let i = 0; i < count; i++) {
      const y = Math.random() * texH
      const depth = y / texH
      const r = (rand(0.7, 1.8) + (1 - depth) * Math.pow(Math.random(), 2.2) * 4.2) * this.s
      const x = Math.random() * texW
      c.beginPath()
      c.arc(x, y, r, 0, TAU)
      c.fillStyle = 'rgba(255, 255, 255, 0.35)'
      c.fill()
      c.lineWidth = 0.7
      c.strokeStyle = 'rgba(184, 140, 70, 0.26)'
      c.stroke()
      if (r > 1.6) {
        c.beginPath()
        c.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU)
        c.fillStyle = 'rgba(255, 255, 255, 0.9)'
        c.fill()
      }
    }
    this.foamTex = tex

    // Encaje: burbujitas en el límite espuma/cerveza
    const n = Math.round(this.w / 5)
    this.lacing = Array.from({ length: n }, () => ({
      x: rand(0, this.w),
      dy: rand(-6, 20),
      r: rand(0.6, 1.8) * this.s,
    }))
  }

  private jumpToEnd(now: number) {
    this.start = now - SKIP_TO
    this.splashes = []
    for (const d of this.drops) d.coveredAt = -1e9
    // Precalentar: que ya haya burbujas subiendo por todo el vaso
    this.bubbles = []
    const interfaceY = this.foamH
    for (let t = 0; t < 7000; t += 50) this.simulateBubbles(50, t, () => interfaceY, null)
  }

  // ------------------------------------------------------------------
  // Loop
  // ------------------------------------------------------------------

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    if (!this.start) this.start = now

    const elapsed = now - this.start
    const done = elapsed >= DONE_AT

    // Ya lleno: con ~30 fps alcanza y ahorra batería
    if (done && now - this.lastDraw < 32) return

    const dt = Math.min(50, this.lastFrame ? now - this.lastFrame : 16)
    this.lastFrame = now
    this.lastDraw = now
    this.time = now

    const f = this.computeFrame(elapsed)
    this.update(dt, f)
    this.draw(f)

    const pct = Math.round(f.p * 100)
    if (pct !== this.lastProgress) {
      this.lastProgress = pct
      this.opts.onProgress?.(f.p)
    }
    if (done && !this.filledFired) {
      this.filledFired = true
      this.opts.onFilled?.()
    }
  }

  private drawStatic() {
    this.time = performance.now()
    const f = this.computeFrame(SKIP_TO)
    this.draw(f)
    this.opts.onProgress?.(1)
    if (!this.filledFired) {
      this.filledFired = true
      this.opts.onFilled?.()
    }
  }

  private computeFrame(e: number): Frame {
    const { h, s } = this
    const p = fillCurve(clamp((e - FILL_START) / FILL))
    const cutT = e - FILL_END

    // Superficies (antes de que llegue el chorro el vaso está vacío)
    const started = e >= FILL_START
    const interfaceBase = started ? h - p * (h - this.foamH) : h + 40
    const foamThick = lerp(4, this.foamH - FOAM_TOP_FINAL, Math.pow(p, 0.7))
    const settle = cutT > 0 ? -7 * Math.sin(cutT / 150) * Math.exp(-cutT / 420) : 0
    const foamTopBase = interfaceBase - foamThick + settle
    this.foamTopBase = foamTopBase
    const impactAmp = cutT > 0 ? Math.exp(-cutT / 380) : clamp((e - FILL_START) / 300)
    this.computeSurfaces(interfaceBase, foamTopBase, foamThick, impactAmp)

    // Canilla: entra desde arriba y la espuma la "empuja" cuando llega arriba
    const tapIn = easeOutBack(clamp(e / TAP_IN))
    const tapOut = clamp((cutT - 60) / 380)
    let tapBottom = TAP_HEIGHT * s + (tapIn - 1) * 110 * s - tapOut * tapOut * 120 * s
    const surfaceAtCenter = this.foamTopAt(this.w / 2)
    tapBottom = Math.min(tapBottom, surfaceAtCenter - 18 * s)

    // Chorro: la punta cae con gravedad; al cortar, la cola cae detrás
    const g = (2 * (h - TAP_HEIGHT * s)) / (STREAM_FALL * STREAM_FALL)
    const fallT = e - STREAM_START
    const head = fallT > 0 ? tapBottom + 0.5 * g * fallT * fallT : -1
    const tail = cutT > 0 ? tapBottom + 0.5 * g * 1.6 * cutT * cutT : tapBottom
    const streamBottom = Math.min(head, surfaceAtCenter + 6)
    const pouring = fallT > 0 && tail < surfaceAtCenter
    const hitting = pouring && head >= surfaceAtCenter

    return {
      p,
      tapBottom,
      streamTop: tail,
      streamBottom,
      pouring,
      hitting,
      impactAmp: hitting ? impactAmp : cutT > 0 ? impactAmp : 0,
      done: e >= DONE_AT,
    }
  }

  private computeSurfaces(interfaceBase: number, foamTopBase: number, foamThick: number, impactAmp: number) {
    const t = this.time
    const [s1, s2, s3, s4] = this.seeds
    const cx = this.w / 2
    const lump = clamp(foamThick / 40, 0.25, 1) * this.s
    for (let i = 0; i < this.xs.length; i++) {
      const x = this.xs[i]
      const wave = 2 * Math.sin(x * 0.018 + t * 0.0021 + s1) + 1.3 * Math.sin(x * 0.043 - t * 0.0031 + s2)
      this.intYs[i] = interfaceBase + wave

      // Cúpulas de espuma + montículo donde pega el chorro
      const domes =
        6 * Math.abs(Math.sin(x * 0.045 + s3 + t * 0.00035)) +
        3 * Math.abs(Math.sin(x * 0.11 + s4 - t * 0.0006)) +
        1.2 * Math.sin(x * 0.31 + s1)
      const dx = (x - cx) / (34 * this.s)
      const mound = 12 * this.s * impactAmp * Math.exp(-dx * dx) * (0.75 + 0.25 * Math.sin(t * 0.018))
      this.topYs[i] = Math.min(foamTopBase + wave * 0.6 - domes * lump - mound, this.intYs[i] - 2)
    }
  }

  private indexAt(x: number) {
    return clamp(Math.round((x + STEP) / STEP), 0, this.xs.length - 1)
  }

  private foamTopAt(x: number) {
    return this.topYs[this.indexAt(x)]
  }

  private interfaceAt(x: number) {
    return this.intYs[this.indexAt(x)]
  }

  // ------------------------------------------------------------------
  // Simulación
  // ------------------------------------------------------------------

  private update(dt: number, f: Frame) {
    const now = this.time
    const cx = this.w / 2
    const impactY = this.foamTopAt(cx)

    this.simulateBubbles(dt, now, (x) => this.interfaceAt(x), f.hitting ? { x: cx, y: this.interfaceAt(cx) } : null)

    // Salpicaduras donde pega el chorro (más fuertes con el vaso vacío)
    if (f.hitting) {
      const strength = 1 + 2.5 * (1 - f.p)
      const count = (dt / 16) * 0.9 * strength
      for (let i = 0; i < count; i++) {
        if (Math.random() > count - i) break
        this.splashes.push({
          x: cx + rand(-4, 4) * this.s,
          y: impactY - 2,
          vx: rand(-0.13, 0.13) * this.s,
          vy: -rand(0.07, 0.2) * this.s * Math.sqrt(strength),
          r: rand(1, 2.6) * this.s,
        })
      }
    }
    const gravity = 0.0009 * this.s
    this.splashes = this.splashes.filter((d) => {
      d.vy += gravity * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      return !(d.vy > 0 && d.y > this.foamTopAt(d.x) + 2) && d.y < this.h + 10
    })

    // Condensación: aparece un ratito después de que el vaso se llena en esa zona
    for (const d of this.drops) {
      if (d.coveredAt === null && this.foamTopAt(d.x) < d.y - d.r) d.coveredAt = now
      if (d.slide) {
        if (d.slide.stoppedAt === null) {
          d.y += d.slide.v * dt
          if (d.y >= d.slide.until || d.y > this.h + 10) d.slide.stoppedAt = now
        } else if (now - d.slide.stoppedAt > 4000) {
          d.slide = null
        }
      }
    }

    // De vez en cuando una gota grande se desliza
    if (f.done && now > this.nextSlide) {
      this.nextSlide = now + rand(2200, 4800)
      const candidates = this.drops.filter((d) => !d.slide && d.r > 3.5 * this.s && d.y < this.h * 0.75)
      const d = candidates[Math.floor(Math.random() * candidates.length)]
      if (d) d.slide = { v: rand(0.02, 0.05), until: d.y + rand(50, 180), startY: d.y, stoppedAt: null }
    }
  }

  private simulateBubbles(
    dt: number,
    now: number,
    surface: (x: number) => number,
    impact: { x: number; y: number } | null,
  ) {
    const { h, s } = this

    // Hileras desde el fondo
    for (const site of this.sites) {
      if (now < site.next) continue
      site.next = now + site.every * rand(0.7, 1.3)
      this.bubbles.push({
        baseX: site.x,
        y: h + 3,
        vy: -rand(0.03, 0.06) * s,
        ay: -rand(0.00004, 0.00008) * s,
        r0: site.r * rand(0.85, 1.15),
        phase: rand(0, TAU),
        wobble: rand(0.2, 0.9) * s,
        age: 0,
      })
    }

    // Burbujas sueltas
    if (Math.random() < dt / 70) {
      this.bubbles.push({
        baseX: rand(0, this.w),
        y: h + 3,
        vy: -rand(0.04, 0.08) * s,
        ay: -rand(0.00003, 0.00007) * s,
        r0: rand(0.7, 2.4) * s,
        phase: rand(0, TAU),
        wobble: rand(0.5, 2) * s,
        age: 0,
      })
    }

    // Aire que mete el chorro: baja y después sube
    if (impact) {
      const n = dt / 9
      for (let i = 0; i < n; i++) {
        this.bubbles.push({
          baseX: impact.x + (Math.random() + Math.random() + Math.random() - 1.5) * 22 * s,
          y: impact.y + rand(2, 16),
          vy: rand(0.12, 0.32) * s,
          ay: -rand(0.00028, 0.0005) * s,
          r0: rand(0.7, 2.2) * s,
          phase: rand(0, TAU),
          wobble: rand(0.5, 2.5) * s,
          age: 0,
        })
      }
    }

    this.bubbles = this.bubbles.filter((b) => {
      b.age += dt
      b.vy += b.ay * dt
      b.y += b.vy * dt
      const x = b.baseX + b.wobble * Math.sin(b.phase + b.age * 0.004)
      const r = b.r0 * (1 + 0.5 * clamp((h - b.y) / h))
      return b.y - r > surface(x) && b.y < h + 12 && b.age < 14000
    })
    if (this.bubbles.length > 420) this.bubbles.splice(0, this.bubbles.length - 420)
  }

  // ------------------------------------------------------------------
  // Dibujo
  // ------------------------------------------------------------------

  private draw(f: Frame) {
    const { ctx, w, h } = this
    ctx.fillStyle = this.gBackground
    ctx.fillRect(0, 0, w, h)

    this.drawStream(f)
    this.drawBeer(f)
    this.drawFoam()
    this.drawSplashes()
    this.drawTap(f)
    this.drawDrops()

    // Vidrio: reflejos verticales y bordes más oscuros (curvatura)
    ctx.fillStyle = this.gGlassLeft
    ctx.fillRect(w * 0.05, 0, w * 0.09, h)
    ctx.fillStyle = this.gGlassRight
    ctx.fillRect(w * 0.86, 0, w * 0.03, h)
  }

  private tracePath(ys: number[], closeTo: number) {
    const { ctx, xs } = this
    ctx.beginPath()
    ctx.moveTo(xs[0], closeTo)
    for (let i = 0; i < xs.length; i++) ctx.lineTo(xs[i], ys[i])
    ctx.lineTo(xs[xs.length - 1], closeTo)
    ctx.closePath()
  }

  private drawBeer(f: Frame) {
    const { ctx, w, h } = this
    const top = Math.min(...this.intYs)
    if (top >= h) return

    ctx.save()
    this.tracePath(this.intYs, h + 2)
    ctx.clip()

    // Más clara cerca de la superficie, más profunda abajo
    const body = ctx.createLinearGradient(0, top, 0, Math.max(top + 1, h))
    body.addColorStop(0, '#ffcf4d')
    body.addColorStop(0.12, '#f7b52c')
    body.addColorStop(0.5, '#e8920f')
    body.addColorStop(0.85, '#b85f02')
    body.addColorStop(1, '#8f4600')
    ctx.fillStyle = body
    ctx.fillRect(0, top - 4, w, h - top + 8)

    // Luz que atraviesa el vaso
    const gy = top + (h - top) * 0.35
    const glow = ctx.createRadialGradient(w * 0.5, gy, 0, w * 0.5, gy, Math.max(w * 0.75, 60))
    glow.addColorStop(0, 'rgba(255, 226, 140, 0.28)')
    glow.addColorStop(1, 'rgba(255, 226, 140, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, top, w, h - top)

    ctx.fillStyle = this.gSideShade
    ctx.fillRect(0, top - 4, w, h - top + 8)

    // Nube de aire donde entra el chorro
    if (f.hitting || f.impactAmp > 0.05) {
      const iy = this.interfaceAt(w / 2) + 30 * this.s
      const pr = (70 + 50 * f.p) * this.s
      const plume = ctx.createRadialGradient(w / 2, iy, 0, w / 2, iy, pr)
      const a = 0.42 * f.impactAmp
      plume.addColorStop(0, `rgba(255, 246, 222, ${a})`)
      plume.addColorStop(1, 'rgba(255, 246, 222, 0)')
      ctx.fillStyle = plume
      ctx.fillRect(w / 2 - pr, iy - pr, pr * 2, pr * 2)
    }

    this.drawBubbles()
    ctx.restore()
  }

  private drawBubbles() {
    const { ctx, h } = this
    const bodies = new Path2D()
    const shines = new Path2D()
    for (const b of this.bubbles) {
      const x = b.baseX + b.wobble * Math.sin(b.phase + b.age * 0.004)
      const r = b.r0 * (1 + 0.5 * clamp((h - b.y) / h))
      bodies.moveTo(x + r, b.y)
      bodies.arc(x, b.y, r, 0, TAU)
      if (r > 1.1) {
        const hr = r * 0.32
        shines.moveTo(x - r * 0.35 + hr, b.y - r * 0.35)
        shines.arc(x - r * 0.35, b.y - r * 0.35, hr, 0, TAU)
      }
    }
    ctx.fillStyle = 'rgba(255, 236, 180, 0.22)'
    ctx.fill(bodies)
    ctx.lineWidth = 0.8
    ctx.strokeStyle = 'rgba(255, 250, 232, 0.62)'
    ctx.stroke(bodies)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.fill(shines)
  }

  private drawFoam() {
    const { ctx, xs, topYs, intYs, w } = this
    const top = Math.min(...topYs)
    const bottom = Math.max(...intYs)
    if (top >= this.h) return

    // Cuerpo de la espuma
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(xs[0], topYs[0])
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], topYs[i])
    for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], intYs[i] + 3)
    ctx.closePath()

    const g = ctx.createLinearGradient(0, top, 0, bottom + 3)
    g.addColorStop(0, '#fffdf6')
    g.addColorStop(0.45, '#fff4da')
    g.addColorStop(0.8, '#f7e3b2')
    g.addColorStop(1, '#efd08a')
    ctx.fillStyle = g
    ctx.fill()
    ctx.clip()

    // Textura de burbujitas, pegada al borde superior
    if (this.foamTex) {
      const baseTop = this.foamTopBase - 14 * this.s
      ctx.globalAlpha = 0.95
      ctx.drawImage(this.foamTex, 0, baseTop, w, this.foamTex.height / this.dpr)
      ctx.globalAlpha = 1
    }

    // Volumen de las cúpulas: brillo arriba y sombra suave debajo
    ctx.beginPath()
    ctx.moveTo(xs[0], topYs[0] + 6)
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], topYs[i] + 6)
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(214, 176, 110, 0.16)'
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(xs[0], topYs[0] + 1.2)
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], topYs[i] + 1.2)
    ctx.lineWidth = 2.2
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.stroke()

    ctx.fillStyle = this.gSideShade
    ctx.globalAlpha = 0.55
    ctx.fillRect(0, top - 12, w, bottom - top + 20)
    ctx.globalAlpha = 1
    ctx.restore()

    // Transición espuma → cerveza (sin borde duro)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(xs[0], intYs[0] + 2)
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], intYs[i] + 2)
    for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], intYs[i] + 30 * this.s)
    ctx.closePath()
    const bandTop = Math.min(...intYs) + 2
    const fade = ctx.createLinearGradient(0, bandTop, 0, bottom + 30 * this.s)
    fade.addColorStop(0, 'rgba(240, 211, 145, 0.9)')
    fade.addColorStop(0.4, 'rgba(248, 214, 130, 0.4)')
    fade.addColorStop(1, 'rgba(255, 207, 77, 0)')
    ctx.fillStyle = fade
    ctx.fill()

    const lace = new Path2D()
    for (const l of this.lacing) {
      const y = this.interfaceAt(l.x) + l.dy
      lace.moveTo(l.x + l.r, y)
      lace.arc(l.x, y, l.r, 0, TAU)
    }
    ctx.lineWidth = 0.7
    ctx.strokeStyle = 'rgba(255, 248, 226, 0.55)'
    ctx.stroke(lace)
    ctx.restore()
  }

  private drawStream(f: Frame) {
    const { ctx, s } = this
    const top = Math.max(f.streamTop, -10)
    const bottom = f.streamBottom
    if (!f.pouring || bottom - top < 1) return

    const cx = this.w / 2
    const t = this.time
    const wTop = 21 * s
    const left: [number, number][] = []
    const right: [number, number][] = []
    const center: [number, number][] = []
    for (let y = top; ; y += 8) {
      const yy = Math.min(y, bottom)
      const fall = clamp((yy - f.tapBottom) / (this.h * 0.55))
      const width = lerp(wTop, wTop * 0.62, Math.sqrt(fall))
      const wob = 1.4 * Math.sin(yy * 0.045 - t * 0.018) * clamp((yy - f.tapBottom) / 160)
      left.push([cx + wob - width / 2, yy])
      right.push([cx + wob + width / 2, yy])
      center.push([cx + wob, yy])
      if (yy >= bottom) break
    }

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(left[0][0], left[0][1])
    for (const [x, y] of left) ctx.lineTo(x, y)
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1])
    ctx.closePath()
    ctx.fillStyle = this.gStream
    ctx.fill()

    // Brillo y "flujo" que baja por el chorro
    const line = (offset: number) => {
      ctx.beginPath()
      center.forEach(([x, y], i) => {
        const fall = clamp((y - f.tapBottom) / (this.h * 0.55))
        const width = lerp(wTop, wTop * 0.62, Math.sqrt(fall))
        if (i === 0) ctx.moveTo(x + offset * width, y)
        else ctx.lineTo(x + offset * width, y)
      })
    }
    line(-0.2)
    ctx.lineWidth = 1.6 * s
    ctx.strokeStyle = 'rgba(255, 255, 240, 0.6)'
    ctx.stroke()

    line(0.14)
    ctx.setLineDash([10 * s, 24 * s])
    ctx.lineDashOffset = -t * 0.9
    ctx.lineWidth = 2 * s
    ctx.strokeStyle = 'rgba(255, 250, 220, 0.35)'
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  private drawSplashes() {
    if (this.splashes.length === 0) return
    const path = new Path2D()
    for (const d of this.splashes) {
      path.moveTo(d.x + d.r, d.y)
      path.arc(d.x, d.y, d.r, 0, TAU)
    }
    this.ctx.fillStyle = 'rgba(255, 249, 232, 0.92)'
    this.ctx.fill(path)
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number | number[]) {
    const { ctx } = this
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
    else ctx.rect(x, y, w, h)
  }

  private drawTap(f: Frame) {
    const { ctx, s } = this
    const bottom = f.tapBottom
    if (bottom < -2) return
    const cx = this.w / 2

    const bodyTop = bottom - TAP_HEIGHT * s
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
    ctx.fillStyle = this.gChrome

    // Cuerpo
    ctx.beginPath()
    this.roundRect(cx - 24 * s, bodyTop - 20 * s, 48 * s, 62 * s, 10 * s)
    ctx.fill()
    ctx.shadowColor = 'transparent'

    // Anillo
    ctx.beginPath()
    this.roundRect(cx - 28 * s, bodyTop + 30 * s, 56 * s, 10 * s, 4 * s)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Pico
    ctx.beginPath()
    this.roundRect(cx - 10 * s, bodyTop + 40 * s, 20 * s, TAP_HEIGHT * s - 40 * s, [0, 0, 7 * s, 7 * s])
    ctx.fill()
    ctx.fillStyle = 'rgba(30, 20, 10, 0.65)'
    ctx.beginPath()
    ctx.ellipse(cx, bottom - 1.5 * s, 6 * s, 2 * s, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  private drawDrops() {
    const { ctx } = this
    const now = this.time
    for (const d of this.drops) {
      if (d.coveredAt === null) continue
      const a = clamp((now - d.coveredAt - 500) / 1600)
      if (a <= 0) continue
      const rx = d.r
      const ry = d.r * d.stretch

      // Rastro de una gota que se deslizó
      if (d.slide) {
        const fadeTrail = d.slide.stoppedAt === null ? 1 : 1 - clamp((now - d.slide.stoppedAt) / 4000)
        ctx.beginPath()
        ctx.moveTo(d.x, d.slide.startY)
        ctx.lineTo(d.x, d.y - ry)
        ctx.lineWidth = rx * 0.7
        ctx.lineCap = 'round'
        ctx.strokeStyle = `rgba(255, 245, 220, ${0.16 * fadeTrail * a})`
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.ellipse(d.x, d.y, rx, ry, 0, 0, TAU)
      ctx.fillStyle = `rgba(255, 250, 235, ${0.1 * a})`
      ctx.fill()

      // Borde oscuro arriba y brillo abajo (la gota funciona como lente)
      ctx.beginPath()
      ctx.ellipse(d.x, d.y, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95)
      ctx.lineWidth = Math.max(0.7, rx * 0.28)
      ctx.strokeStyle = `rgba(110, 50, 0, ${0.32 * a})`
      ctx.stroke()

      ctx.beginPath()
      ctx.ellipse(d.x, d.y, rx * 0.92, ry * 0.92, 0, Math.PI * 0.15, Math.PI * 0.85)
      ctx.lineWidth = Math.max(0.7, rx * 0.3)
      ctx.strokeStyle = `rgba(255, 246, 215, ${0.6 * a})`
      ctx.stroke()

      ctx.beginPath()
      ctx.ellipse(d.x - rx * 0.35, d.y - ry * 0.4, rx * 0.26, ry * 0.2, -0.5, 0, TAU)
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * a})`
      ctx.fill()
    }
  }
}
