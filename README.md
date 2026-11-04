# EscabiARG 🍺

La app para tomar con amigos.

## Stack

- [Vite](https://vite.dev/) + React + TypeScript
- [Supabase](https://supabase.com/) para login y base de datos
- Deploy en [Netlify](https://www.netlify.com/) (config en `netlify.toml`)

## Desarrollo

```bash
npm install
cp .env.example .env.local   # y completá los datos de Supabase
npm run dev
```

## Probar sin cuenta (modo demo)

Para recorrer las pantallas sin registrarte ni configurar nada:

- En el login tocá **"Probar sin cuenta (demo)"**, o
- abrí la app con `?demo` al final de la URL (ej: `https://tu-sitio.netlify.app/?demo`).

La demo trae amigos y viajes de ejemplo, y todo lo que hagas (agregar amigos,
crear viajes, cargar tragos con fotos, misiones, quiebres, ruleta) se guarda
**solo en ese navegador**. En el viaje "Finde en la costa" sos el organizador y
ganaste la jornada de ayer, así que podés girar la ruleta apenas entrás. Para
agregar amigos usá los códigos de prueba que aparecen en el panel de amigos
(`COLO22`, `SOFI99`, `NACHO7`). Al tocar "Salir de la demo" se borran los datos.

Cuando la app esté lista para el público, ocultá la demo con `VITE_ENABLE_DEMO=false`.

## Configurar Supabase (una sola vez)

1. Creá un proyecto en [supabase.com](https://supabase.com/dashboard).
2. **Base de datos**: en *SQL Editor*, pegá y ejecutá **en este orden**:
   1. `supabase/migrations/20261104000000_amigos_y_viajes.sql`
   2. `supabase/migrations/20261105000000_juego_del_viaje.sql` (también crea el
      bucket privado `trip-photos` de Storage para las fotos)
   3. `supabase/migrations/20261106000000_validaciones_y_votaciones.sql`

   (o con la CLI: `supabase link` + `supabase db push`).
3. **Login** (*Authentication → Sign In / Providers*):
   - **Email**: viene habilitado. Si dejás *Confirm email* activado, el usuario
     tiene que confirmar desde el mail antes de entrar.
   - **Invitado**: activá *Allow anonymous sign-ins*.
   - **Google** (opcional): habilitá el proveedor Google y poné
     `VITE_ENABLE_GOOGLE_AUTH=true`.
4. *Authentication → URL Configuration*: poné la URL de Netlify en **Site URL**
   y agregá `http://localhost:5173` en **Redirect URLs** para desarrollo.
5. Copiá **Project URL** y la **publishable key** (o *anon key*) en `.env.local`.

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key / anon key (es pública, la protege RLS) |
| `VITE_ENABLE_GOOGLE_AUTH` | `true` para mostrar "Continuar con Google" |
| `VITE_ENABLE_DEMO` | `false` para ocultar el modo demo (por defecto está visible) |

## Deploy en Netlify

Conectá el repo en Netlify; toma automáticamente `netlify.toml`
(build `npm run build`, publica `dist`). Cargá las mismas variables de entorno en
*Site configuration → Environment variables* y volvé a deployar.

## Qué hay hasta ahora

- **Pantalla de carga**: un vaso de cerveza dibujado en `<canvas>` que llena toda la
  pantalla: canilla, chorro con caída, espuma que se forma mientras se sirve,
  hileras de burbujas, salpicaduras y gotas de condensación. Se saltea tocando y
  respeta `prefers-reduced-motion` (`src/components/beer/BeerRenderer.ts`).
- **Login**: email + contraseña, invitado (anónimo), Google opcional y modo demo.
- **Inicio**: logo arriba, botón de **amigos** (tu código + agregar por código),
  **Crear viaje** (nombre, fecha, lugar e invitar amigos) y la lista de **tus viajes**.

### Pantalla del viaje

Se entra tocando un viaje en el inicio (`#/viaje/<id>`).

- **Tragos con puntos**: el organizador arma la carta (nombre, ícono y puntos) y
  las reglas. Los demás solo la ven.
- **Cargar trago**: elegís el trago y **sacás una foto con la cámara de la app**
  (no se pueden subir fotos de la galería). El servidor además solo acepta fotos
  subidas hace menos de 30 minutos y que no se hayan usado antes.
- **Validación**: los tragos y quiebres quedan *pendientes* hasta que **más de la
  mitad** del resto del grupo mira la foto y dice "vale" (no votan ni quien lo cargó
  ni a quien afecta). Si ya no se puede llegar a esa mayoría, queda rechazado. En el
  viaje aparece la sección **🔔 Pendientes** y en el inicio un aviso con la cantidad.
- **Misión diaria**: cada jugador elige Fácil / Intermedia / Extrema y le toca una
  misión al azar (bien argentinas, algunas atrevidas pero sin nada peligroso).
  Puntos por defecto: 10 / 25 / 50 (el organizador los cambia). Todos ven las
  misiones de todos.
- **Votar una misión mala**: cualquiera abre la votación sobre la misión de otro
  (10 min). Si la mayoría dice que es mala, cada uno escribe una opción (3 min) y
  después hay **60 segundos** para votar la mejor (no se vota la propia). La
  ganadora pasa a ser la misión de ese jugador.
- **Quiebre**: cualquiera del viaje reporta quién quebró con 1 a 3 fotos y se le
  restan puntos (30 por defecto).
- **Puntaje diario y general**: solo cuentan los puntos validados. La jornada
  termina a la hora que elige el organizador (por defecto **6:00, hora Argentina**).
- **Galería**: todas las fotos del viaje (tragos, quebradas y misiones), con filtros.
- **Ruleta**: cuando termina una jornada, quien más sumó (si hay empate, todos los
  empatados) gira la ruleta una vez y gana una **carta comodín** para usar cuando quiera:

  | Comodín | Efecto |
  | --- | --- |
  | 🎁 Ronda de la casa | +20 puntos |
  | 🦹 Manotazo | le sacás 15 puntos a otro jugador |
  | ✌️ Doble o nada | tu próximo trago suma el doble |
  | 🛡️ Escudo anti-quiebre | la próxima vez que quebrás no te restan |
  | 🎧 DJ de la noche | elegís la música una hora |
  | 🥂 Brindis en tu honor | todos brindan por vos |

### Modelo de datos

- `profiles`: nombre y `friend_code` de 6 caracteres (se crea solo al registrarse).
- `friendships`: amistad mutua (al agregar a alguien por código quedan los dos como amigos).
- `trips` + `trip_members`: viajes y quiénes participan (el creador queda como `owner`).
  `trips` también guarda las reglas (puntos de misiones y descuento por quebrar).
- `trip_drinks`: la carta de tragos de cada viaje.
- `trip_events`: todo lo que suma o resta puntos (tragos, misiones, quiebres, comodines).
- `daily_missions`, `mission_catalog`: misión de cada jugador por jornada.
- `player_cards`, `card_catalog`: comodines ganados en la ruleta.
- `event_votes`: validaciones de fotos de tragos y quiebres.
- `mission_challenges`, `challenge_bad_votes`, `challenge_options`,
  `challenge_option_votes`: votaciones de misiones.

Las escrituras pasan por funciones (`add_friend_by_code`, `remove_friend`,
`create_trip`, `log_drink`, `choose_daily_mission`, `complete_daily_mission`,
`report_quiebre`, `spin_roulette`, `redeem_card`, `vote_event`,
`start_mission_challenge`, `vote_mission_bad`, `propose_mission_option`,
`start_option_vote`, `vote_mission_option`) que validan todo del lado del servidor; con RLS cada usuario
solo ve su perfil, sus amigos y los viajes en los que participa.
