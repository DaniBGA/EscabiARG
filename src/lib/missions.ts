import type { Difficulty } from './api'

/**
 * Misiones de la demo. Son las mismas que carga la migración en mission_catalog
 * (supabase/migrations/20261106000000_validaciones_y_votaciones.sql).
 */
export const MISSIONS: Record<Difficulty, string[]> = {
  easy: [
    'Sacate una selfie con todo el grupo haciendo cuernitos 🤘.',
    'Cebale un mate (o lo que haya) a cada uno del grupo.',
    'Hablá sin decir "boludo" durante 15 minutos. Si se te escapa, arrancás de cero.',
    'Contá la anécdota más bizarra de tu vida y que al menos uno se ría.',
    'Proponé un brindis y que todo el grupo choque los vasos.',
    'Validá las fotos de tragos de tus amigos sin hacerte rogar durante toda la jornada.',
    'Cargá un vaso de agua en la app antes de tu próximo trago.',
    'Poné un tema de cumbia y conseguí que al menos 2 lo bailen con vos.',
    'Pedí la próxima ronda hablando con tonada cordobesa.',
    'Ponele un apodo a cada uno del grupo y que todos lo usen hasta mañana.',
  ],
  medium: [
    'Chamuyate a alguien del lugar hasta que se ría (con onda: si no da, no da).',
    'Relatá como un gol de Argentina en la final del Mundial el próximo trago que carguen.',
    'Conseguí que un desconocido te diga su fernet ideal, con proporciones incluidas.',
    'Hacé que todo el grupo cante un cantito de cancha (que no sea ofensivo).',
    'Conseguí que alguien que no conocés se saque una foto con el grupo.',
    'Hablá como un porteño cheto durante 15 minutos.',
    'Sé el mozo del grupo: traé la próxima ronda para todos (de agua también vale).',
    'Sacale foto a tu próximo trago como si fuera una publicidad y que te lo validen.',
    'Ganate un abrazo de alguien que no conocías hasta hoy.',
    'Imitá a alguien del grupo hasta que adivinen quién es.',
  ],
  extreme: [
    'Chamuyate a alguien que te guste y conseguí su Instagram (si dice que no, es no).',
    'Cantá una canción entera de cuarteto o cumbia delante de todos.',
    'Subite a una silla y hacé un discurso de 1 minuto sobre por qué sos el mejor del viaje.',
    'Conseguí que pasen en el lugar un tema que vos elijas.',
    'Bailá solo en el medio de la pista una canción entera.',
    'Hacele una declaración de amor de telenovela a alguien del grupo.',
    'Conseguí 3 firmas de desconocidos en una servilleta que diga "Aguante EscabiARG".',
    'Terminá la jornada primero en la tabla diaria.',
    'Llegá al final de la jornada sin quebrar y con 2 vasos de agua cargados en la app.',
    'Hacé un TikTok bailando con al menos 3 del grupo.',
  ],
}
