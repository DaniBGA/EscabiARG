/**
 * Términos y condiciones de EscabiARG.
 * Si cambia el texto de forma importante, subí TERMS_VERSION: a todos se les vuelven a pedir.
 */
export const TERMS_VERSION = 1
export const TERMS_DATE = '16 de noviembre de 2026'

export type TermsSection = { title: string; items: string[] }

export const TERMS: TermsSection[] = [
  {
    title: '1. Solo para mayores de 18 años',
    items: [
      'EscabiARG es exclusiva para mayores de 18 años. Al aceptar, declarás que tenés 18 años o más.',
      'Está prohibido que la usen menores de edad o que se les haga participar de cualquier actividad de la app.',
    ],
  },
  {
    title: '2. Qué es (y qué no es) EscabiARG',
    items: [
      'Es una app para organizar juegos y salidas entre amigos: llevar un registro del viaje, misiones, prendas, fotos y una tabla de puntos.',
      'EscabiARG no vende alcohol, no gestiona pedidos ni entregas y no intermedia en ninguna compra.',
      'EscabiARG no es un casino ni un operador de juegos de azar: no gestiona apuestas, depósitos, retiros, fichas ni premios.',
      'Los puntos, comodines y rankings son simbólicos: no tienen valor económico, no se compran ni se canjean por dinero, bienes o servicios.',
    ],
  },
  {
    title: '3. Vos decidís: el registro de tragos es voluntario',
    items: [
      'Cargar lo que tomás es opcional y tiene una finalidad informativa y de juego entre amigos.',
      'EscabiARG no ofrece ninguna recompensa real por tomar: no hay dinero, premios, descuentos ni beneficios de ningún tipo. Los puntos solo sirven para el juego entre amigos.',
      'Todo lo que pasa en la app lo deciden los propios usuarios: si toman o no, cuánto, y si proponen o aceptan un duelo, un reto o una prenda. El límite y hasta dónde llegar lo define cada uno.',
      'Nadie está obligado a tomar alcohol para participar: misiones, prendas, ruletas y duelos se pueden rechazar o abandonar en cualquier momento, sin consecuencias.',
      'Podés dejar de tomar, bajarte de un duelo o dejar de jugar cuando quieras. Cada decisión que tomes dentro o fuera de la app es tu responsabilidad.',
      'Tomá con moderación, hidratate y nunca tomes si vas a manejar. Si alguien del grupo no está bien, priorizá su cuidado antes que el juego.',
    ],
  },
  {
    title: '4. Salidas al casino',
    items: [
      'Las salidas a casinos las organizan los propios usuarios, por su cuenta y fuera de la app.',
      'La app solo ofrece un temporizador y un registro informativo de quién sigue jugando entre amigos. No recibe, guarda ni transfiere dinero, y no tiene relación con ningún casino.',
      'Lo que cada uno apueste o pierda es exclusivamente su responsabilidad. Jugá de forma responsable y con lo que puedas permitirte perder.',
    ],
  },
  {
    title: '5. La responsabilidad es tuya',
    items: [
      'Sos el único responsable de lo que consumís, de las actividades que hacés (misiones, prendas, duelos, salidas) y de sus consecuencias.',
      'EscabiARG y sus desarrolladores no se hacen responsables por excesos, daños, accidentes, pérdidas económicas ni conflictos entre usuarios o con terceros derivados del uso de la app.',
      'No hagas nada que ponga en riesgo tu salud, la de otros o que sea ilegal, aunque sea parte de una misión o prenda.',
    ],
  },
  {
    title: '6. Fotos, videos y contenido que subís',
    items: [
      'Sos responsable de las fotos, videos y textos que subís. Solo podés subir contenido propio o de personas que estén de acuerdo.',
      'Está prohibido subir contenido sexual, violento, ilegal, que involucre a menores o que muestre a terceros sin su consentimiento.',
      'El organizador de un viaje puede eliminarlo, y con él todo su contenido.',
    ],
  },
  {
    title: '7. Cómo protegemos tus datos',
    items: [
      'Toda la comunicación entre la app y los servidores viaja cifrada (HTTPS / TLS).',
      'Los datos, fotos y videos se guardan en los servidores de Supabase, cifrados en reposo (AES-256).',
      'Las fotos y videos se guardan en un almacenamiento privado: solo los pueden ver los miembros de ese viaje, a través de enlaces temporales que vencen en una hora.',
      'La foto de perfil es opcional y la podés cambiar o quitar cuando quieras. Para que cargue rápido se ve con un enlace público con un nombre imposible de adivinar: no la uses si no querés que la vea alguien que tenga ese enlace.',
      'Las notificaciones son opcionales: solo se activan si vos lo pedís y le das permiso al navegador. Para mandártelas se guarda una dirección cifrada de tu navegador (no tu número ni tu ubicación). Las podés desactivar desde tu perfil o desde el navegador.',
      'Las reglas de acceso de la base de datos impiden que alguien que no forma parte de un viaje vea su información.',
      'Las contraseñas nunca se guardan en texto: solo se guarda una versión cifrada de forma irreversible (hash).',
      'Al eliminar un viaje se borran sus fotos, videos y datos. Podés pedir el acceso, la corrección o la eliminación de tus datos personales (Ley 25.326 de Protección de Datos Personales).',
      'El cifrado protege los datos guardados y los que viajan por internet, pero no es cifrado de punta a punta: el proveedor que aloja la información podría acceder a ella por razones técnicas o por orden legal.',
    ],
  },
  {
    title: '8. Cambios en estos términos',
    items: [
      'Podemos actualizar estos términos. Si el cambio es importante, te los vamos a volver a mostrar para que los aceptes antes de seguir usando la app.',
    ],
  },
]
