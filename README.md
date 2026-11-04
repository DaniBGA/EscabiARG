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
crear viajes, cambiar tu nombre) se guarda **solo en ese navegador**. Para
agregar amigos usá los códigos de prueba que aparecen en el panel de amigos
(`COLO22`, `SOFI99`, `NACHO7`). Al tocar "Salir de la demo" se borran los datos.

Cuando la app esté lista para el público, ocultá la demo con `VITE_ENABLE_DEMO=false`.

## Configurar Supabase (una sola vez)

1. Creá un proyecto en [supabase.com](https://supabase.com/dashboard).
2. **Base de datos**: en *SQL Editor*, pegá y ejecutá
   `supabase/migrations/20261104000000_amigos_y_viajes.sql`
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

### Modelo de datos

- `profiles`: nombre y `friend_code` de 6 caracteres (se crea solo al registrarse).
- `friendships`: amistad mutua (al agregar a alguien por código quedan los dos como amigos).
- `trips` + `trip_members`: viajes y quiénes participan (el creador queda como `owner`).

Las escrituras pasan por funciones (`add_friend_by_code`, `remove_friend`,
`create_trip`) que validan todo del lado del servidor; con RLS cada usuario
solo ve su perfil, sus amigos y los viajes en los que participa.
