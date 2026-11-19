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

export const LEFT_HAND = { src: manoIzq, box: { x: 1.04, y: 15.71, w: 49.44, h: 49.52 } }
export const RIGHT_HAND = { src: manoDer, box: { x: 49.52, y: 15.87, w: 49.52, h: 49.76 } }
export const RAYS = { src: rayos, box: { x: 37.0, y: 5.74, w: 26.16, h: 13.8 } }

const LETTER_SRC = [letra0, letra1, letra2, letra3, letra4, letra5, letra6, letra7, letra8]
const LETTER_BOX: Box[] = [
  { x: 4.15, y: 62.04, w: 15.47, h: 19.7 },
  { x: 16.67, y: 66.35, w: 11.4, h: 13.88 },
  { x: 26.71, y: 66.27, w: 11.0, h: 13.48 },
  { x: 35.81, y: 66.19, w: 12.2, h: 13.32 },
  { x: 46.89, y: 62.2, w: 13.4, h: 17.22 },
  { x: 58.85, y: 63.16, w: 7.02, h: 16.35 },
  { x: 64.11, y: 66.03, w: 12.76, h: 13.8 },
  { x: 75.6, y: 66.19, w: 10.69, h: 13.32 },
  { x: 81.9, y: 66.11, w: 15.63, h: 18.34 },
]
/** E · s · c · a · b · i · a · r · g */
export const LETTERS = LETTER_SRC.map((src, i) => ({ src, box: LETTER_BOX[i] }))
