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

## Deploy en Netlify

Conectá el repo en Netlify; toma automáticamente `netlify.toml`
(build `npm run build`, publica `dist`). Cargá las mismas variables de entorno en
*Site configuration → Environment variables* y volvé a deployar.

## Qué hay hasta ahora

- **Pantalla de carga**: un vaso de cerveza que llena toda la pantalla (chorro,
  burbujas y espuma). Se saltea tocando y respeta `prefers-reduced-motion`.
- **Login**: email + contraseña, invitado (anónimo) y Google opcional.
- **Inicio**: logo arriba, botón de **amigos** (tu código + agregar por código),
  **Crear viaje** (nombre, fecha, lugar e invitar amigos) y la lista de **tus viajes**.

### Modelo de datos

- `profiles`: nombre y `friend_code` de 6 caracteres (se crea solo al registrarse).
- `friendships`: amistad mutua (al agregar a alguien por código quedan los dos como amigos).
- `trips` + `trip_members`: viajes y quiénes participan (el creador queda como `owner`).

Las escrituras pasan por funciones (`add_friend_by_code`, `remove_friend`,
`create_trip`) que validan todo del lado del servidor; con RLS cada usuario
solo ve su perfil, sus amigos y los viajes en los que participa.
