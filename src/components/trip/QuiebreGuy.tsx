import './QuiebreGuy.css'

type Props = {
  size?: number
  /** Repetir la animación sin parar (si no, la hace 3 veces) */
  loop?: boolean
}

/** Muñequito caricaturesco quebrando (vomitando), animado con CSS */
export default function QuiebreGuy({ size = 200, loop = false }: Props) {
  return (
    <svg
      viewBox="0 0 220 220"
      width={size}
      height={size}
      className={`qg${loop ? ' qg--loop' : ''}`}
      role="img"
      aria-label="Alguien quebrando"
    >
      {/* Charco */}
      <ellipse className="qg-puddle" cx="156" cy="202" rx="36" ry="9" fill="#8fc94a" stroke="#16110c" strokeWidth="3" />

      <g className="qg-body">
        {/* Piernas */}
        <path d="M74 152 L64 204 M98 152 L104 204" stroke="#16110c" strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M56 205 H72 M98 205 H114" stroke="#16110c" strokeWidth="7" strokeLinecap="round" />
        {/* Torso inclinado */}
        <path
          d="M58 96 Q56 140 70 158 L106 158 Q120 126 104 92 Q82 84 58 96 Z"
          fill="#f2a71b"
          stroke="#16110c"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M66 122 Q84 128 102 120" stroke="#16110c" strokeWidth="2" fill="none" opacity="0.35" />
        {/* Brazo agarrándose la panza */}
        <path d="M98 104 Q108 124 88 136" stroke="#16110c" strokeWidth="7" strokeLinecap="round" fill="none" />
        <circle cx="86" cy="137" r="6" fill="#c5e08f" stroke="#16110c" strokeWidth="3" />

        <g className="qg-head">
          <circle cx="112" cy="70" r="30" fill="#c5e08f" stroke="#16110c" strokeWidth="3.5" />
          {/* Pelo */}
          <path d="M86 58 Q96 34 120 40 Q134 42 140 56" stroke="#16110c" strokeWidth="6" fill="none" strokeLinecap="round" />
          {/* Ojos en X */}
          <path d="M98 60 l9 9 m0 -9 l-9 9 M116 58 l9 9 m0 -9 l-9 9" stroke="#16110c" strokeWidth="3.5" strokeLinecap="round" />
          {/* Cachetes */}
          <circle cx="98" cy="82" r="5" fill="#9ccc5a" />
          {/* Boca abierta */}
          <ellipse cx="134" cy="84" rx="8" ry="10" fill="#16110c" />
          {/* Gota de transpiración */}
          <path className="qg-sweat" d="M90 46 q-5 8 0 11 q5 -3 0 -11 z" fill="#9fd3ff" stroke="#16110c" strokeWidth="2" />
        </g>
      </g>

      {/* Chorro */}
      <path className="qg-stream" d="M138 90 C 168 104, 140 150, 156 198" stroke="#8fc94a" strokeWidth="13" strokeLinecap="round" fill="none" />
      <path className="qg-stream qg-stream--light" d="M139 92 C 164 106, 142 150, 155 196" stroke="#cfe98f" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* Salpicaduras */}
      <circle className="qg-drop qg-drop--1" cx="140" cy="196" r="4" fill="#8fc94a" stroke="#16110c" strokeWidth="2" />
      <circle className="qg-drop qg-drop--2" cx="172" cy="194" r="3.5" fill="#8fc94a" stroke="#16110c" strokeWidth="2" />
      <circle className="qg-drop qg-drop--3" cx="182" cy="200" r="3" fill="#8fc94a" stroke="#16110c" strokeWidth="2" />

      {/* Estrellitas de mareo */}
      <g className="qg-stars">
        <path d="M112 18 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1 z" fill="#f2a71b" stroke="#16110c" strokeWidth="2" />
        <circle cx="88" cy="30" r="4" fill="#f3e7c9" stroke="#16110c" strokeWidth="2" />
        <circle cx="138" cy="30" r="3" fill="#f3e7c9" stroke="#16110c" strokeWidth="2" />
      </g>
    </svg>
  )
}
