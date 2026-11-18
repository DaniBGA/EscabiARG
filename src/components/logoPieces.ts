// Piezas del logo (recortadas de la imagen original de 1254 × 1254).
// Posición y tamaño en % de esa imagen.
import manoDer from '../assets/logo/mano-der.webp'
import manoIzq from '../assets/logo/mano-izq.webp'
import rayos from '../assets/logo/rayos.webp'
import letra0 from '../assets/logo/letra-0.webp'
import letra1 from '../assets/logo/letra-1.webp'
import letra2 from '../assets/logo/letra-2.webp'
import letra3 from '../assets/logo/letra-3.webp'
import letra4 from '../assets/logo/letra-4.webp'
import letra5 from '../assets/logo/letra-5.webp'
import letra6 from '../assets/logo/letra-6.webp'
import letra7 from '../assets/logo/letra-7.webp'
import letra8 from '../assets/logo/letra-8.webp'

export type Box = { x: number; y: number; w: number; h: number }

export const LEFT_HAND = { src: manoIzq, box: { x: 0.8, y: 16.43, w: 49.52, h: 48.09 } }
export const RIGHT_HAND = { src: manoDer, box: { x: 49.68, y: 16.59, w: 49.52, h: 48.33 } }
export const RAYS = { src: rayos, box: { x: 37.16, y: 5.9, w: 25.84, h: 13.48 } }

const LETTER_SRC = [letra0, letra1, letra2, letra3, letra4, letra5, letra6, letra7, letra8]
const LETTER_BOX: Box[] = [
  { x: 4.31, y: 62.2, w: 15.15, h: 19.38 },
  { x: 16.83, y: 66.51, w: 11.08, h: 13.56 },
  { x: 26.87, y: 66.43, w: 10.69, h: 13.16 },
  { x: 35.96, y: 66.35, w: 11.88, h: 13.0 },
  { x: 47.05, y: 62.36, w: 13.08, h: 16.91 },
  { x: 59.01, y: 63.32, w: 6.7, h: 16.03 },
  { x: 64.27, y: 66.19, w: 12.44, h: 13.48 },
  { x: 75.76, y: 66.35, w: 10.37, h: 13.0 },
  { x: 82.06, y: 66.27, w: 15.31, h: 18.02 },
]
/** E · s · c · a · b · i · a · r · g */
export const LETTERS = LETTER_SRC.map((src, i) => ({ src, box: LETTER_BOX[i] }))
