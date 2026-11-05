# Deploy de EscabiARG (Supabase + Netlify)

Guía paso a paso para poner la app online con login real, base de datos y fotos.
Tiempo estimado: 20–30 minutos.

Necesitás:

- La cuenta de GitHub con el repo `DaniBGA/EscabiARG` (ya la tenés).
- Una cuenta en [Supabase](https://supabase.com) (gratis).
- Una cuenta en [Netlify](https://www.netlify.com) (gratis), idealmente entrando con GitHub.

> Los nombres de los menús de Supabase y Netlify cambian seguido. Si algo no
> aparece exactamente con el nombre de esta guía, buscá la opción equivalente.

---

## 1. Crear el proyecto en Supabase

1. Entrá a <https://supabase.com/dashboard> → **New project**.
2. Completá:
   - **Name:** `escabiarg`
   - **Database password:** generá una y **guardala** (no la vas a necesitar en la app,
     pero sí si algún día usás la CLI).
   - **Region:** **South America (São Paulo)**, la más cercana a Argentina.
3. **Create new project** y esperá 1–2 minutos a que termine de crearse.

## 2. Crear la base de datos

1. En el menú de la izquierda: **SQL Editor** → **New query**.
2. Abrí el archivo [`supabase/setup_completo.sql`](supabase/setup_completo.sql) del repo,
   copiá **todo** el contenido y pegalo en el editor.
3. Tocá **Run**. Tiene que terminar sin errores ("Success").
4. Verificá:
   - **Table Editor**: aparecen tablas como `profiles`, `trips`, `trip_events`, `duels`…
   - **Storage**: aparece el bucket **`trip-photos`** (privado). Ahí van a quedar las fotos.

> **¿Ya habías corrido alguna migración antes?** No uses `setup_completo.sql`
> (fallaría porque las tablas ya existen). Corré, en orden, solo los archivos de
> `supabase/migrations/` que te falten:
>
> | Orden | Archivo |
> | --- | --- |
> | 1 | `20261104000000_amigos_y_viajes.sql` |
> | 2 | `20261105000000_juego_del_viaje.sql` |
> | 3 | `20261106000000_validaciones_y_votaciones.sql` |
> | 4 | `20261107000000_prendas_ruleta_casino.sql` |
> | 5 | `20261108000000_duelos.sql` |
> | 6 | `20261109000000_previa_y_salida.sql` |
> | 7 | `20261110000000_tiempo_real.sql` |
> | 8 | `20261111000000_quemar.sql` |
> | 9 | `20261112000000_viajes_y_boliche.sql` |

### 2.b Tiempo real

La app se actualiza sola en todos los celulares apenas alguien carga un trago, vota,
arranca un duelo, etc. (Supabase **Realtime**). No hay que activar nada: viene prendido
en los proyectos de Supabase y la migración 7 ya configura quién puede escuchar cada
viaje (solo sus miembros).

> Si Realtime no anda por algún motivo, la app no se rompe: vuelve a refrescar sola
> cada unos segundos, como antes.

## 3. Configurar el login

Todo esto está en **Authentication** (menú izquierdo).

### 3.1 Email y contraseña

1. **Sign In / Providers** → **Email**: tiene que estar habilitado (viene así).
2. **Muy importante — "Confirm email":** el servicio de mails que trae Supabase por
   defecto **solo les manda mails a los miembros de tu organización de Supabase** y
   como mucho ~2 por hora. Si lo dejás activado, tus amigos se registran pero nunca
   les llega el mail para confirmar.
   - **Para arrancar:** desactivá **Confirm email**. Se registran y entran directo.
   - **Para producción:** configurá un SMTP propio en
     **Authentication → Emails → SMTP Settings** y después volvé a activar
     **Confirm email**. Recomendado: **Brevo** (gratis para siempre, paso 3.1.b).

### 3.1.b Mails gratis con Brevo (recomendado)

Brevo tiene un plan gratis sin vencimiento de **300 mails por día**, que alcanza de
sobra para las confirmaciones de cuenta. Los menús de Brevo cambian de nombre seguido:
si algo no aparece exacto, buscá el equivalente.

**A. En Brevo**

1. **Cuenta:** entrá a <https://www.brevo.com> → **Sign up free**. Confirmá tu mail y
   completá todo el perfil que te pide (nombre, empresa —podés poner `EscabiARG`—,
   dirección, teléfono). Con el perfil incompleto Brevo puede no habilitarte el envío.
2. **Remitente:** menú de tu cuenta (arriba a la derecha) →
   **Senders, Domains & Dedicated IPs** → pestaña **Senders** → **Add sender**:
   - **From name:** `EscabiARG`
   - **From email:** la dirección desde la que van a salir los mails.
   - Guardá. Brevo manda un **código de 6 dígitos** a esa casilla
     (asunto parecido a *"[Brevo] Activate your new sender"*) → pegalo → **Verify**.
   - **Con dominio propio** (lo ideal): en la pestaña **Domains** → **Add a domain**
     → cargá en el DNS de tu dominio los registros que te da (código de Brevo, DKIM,
     DMARC). Así los mails llegan a la bandeja de entrada.
   - **Sin dominio (con un Gmail):** sirve para arrancar, pero Gmail/Hotmail no se
     pueden autenticar en Brevo y muchos mails van a caer en **spam** o no llegar.
     Avisales a tus amigos que revisen spam.
3. **Credenciales SMTP:** menú de tu cuenta → **SMTP & API** → pestaña **SMTP**:
   - Anotá el **Login** tal cual aparece. En cuentas nuevas es un mail generado del
     estilo `9a1b2c001@smtp-brevo.com`; en algunas cuentas viejas es tu mail de Brevo.
   - **Generate a new SMTP key** → nombre `supabase-escabiarg` → **Generate** →
     copiá la clave: **se muestra una sola vez**. Es distinta de la API key (las API
     keys empiezan con `xkeysib-` y **no** sirven para SMTP).

**B. En Supabase**

4. **Authentication → Emails → SMTP Settings** → activá **Enable custom SMTP**:

   | Campo | Valor |
   | --- | --- |
   | Sender email address | **exactamente** el *From email* verificado en el paso 2 |
   | Sender name | `EscabiARG` |
   | Host | `smtp-relay.brevo.com` |
   | Port number | `587` |
   | Minimum interval per user | dejalo como está (60 segundos) |
   | Username | el **Login** del paso 3 |
   | Password | la **SMTP key** del paso 3 (no la API key ni tu contraseña de Brevo) |

   **Save changes.**
5. **Authentication → Rate Limits:** con SMTP propio arranca en 30 mails por hora;
   dejalo así (el tope de Brevo es 300 por día).
6. **Sign In / Providers → Email:** activá **Confirm email**.
7. **Mail en español:** **Authentication → Emails → Templates → Confirm signup** → pegá
   [`supabase/email-templates/confirmar-cuenta.html`](supabase/email-templates/confirmar-cuenta.html)
   y de asunto *"Confirmá tu cuenta de EscabiARG 🍺"*.
8. Revisá que el paso 6 de esta guía (**URL Configuration**) esté hecho: si no, el
   link del mail te manda a `localhost`.

**C. Probar**

9. Desde la app: **Continuar con email → Creá tu cuenta** con un mail que nunca
   hayas usado. Tiene que aparecer *"Te mandamos un mail para confirmar la cuenta"*.
10. Abrí el mail (mirá en spam) → tocá el botón → vuelve a la app con la cuenta lista.
11. En Brevo, en la sección de mails **transaccionales** (**Transactional → Logs** o
    **Statistics**), ves si el mail salió, rebotó o lo bloquearon.

**Si falla**, mirá **Supabase → Logs → Auth**: ahí aparece la respuesta del SMTP.

| El log dice algo como… | Qué hacer |
| --- | --- |
| `535 … Authentication failed` | Username o Password mal. Copiá de nuevo el Login y generá una SMTP key nueva |
| Remitente inválido / no verificado (`sender … not valid`) | El *Sender email* de Supabase no coincide con el remitente verificado en Brevo |
| `SMTP account is not yet activated` | Brevo todavía no te habilitó el envío transaccional: completá el perfil y pedí la activación a soporte desde tu cuenta de Brevo (puede tardar 1–2 días hábiles) |
| Timeout o no conecta | Probá el puerto `2525` |
| Supabase dice `user confirmation requested` (200) pero no llega ni a spam | Supabase ya le pasó el mail a Brevo: el problema está entre Brevo y tu casilla. Mirá el estado en los logs de Brevo (abajo) |

**Supabase dice 200 pero el mail no llega.** En Brevo abrí los logs de mails
transaccionales (**Transactional → Email → Logs**, o **Statistics → Logs**) y buscá
tu dirección:

- **No aparece nada:** el mail no pasó por Brevo. Volvé a **SMTP Settings** en Supabase
  y revisá que **Enable custom SMTP** haya quedado activado y guardado.
- **Hard bounce / Blocked / Error:** abrí el detalle. Si el remitente es un `@gmail.com`
  (o Hotmail, Yahoo), Gmail rechaza el mail porque llega desde servidores de Brevo y
  no de Google (falla DMARC). Se arregla con un dominio propio autenticado en Brevo, o
  mandando con tu Gmail directamente (paso 3.1.d).
- **Blocked por blocklist:** después de un rebote Brevo bloquea esa dirección y no le
  manda más. Sacala de la lista de contactos bloqueados de Transactional.
- **Delivered:** llegó. En Gmail buscá `in:anywhere EscabiARG` (puede estar en
  *Promociones*, *Actualizaciones* o *Spam*).


### 3.1.d Sin dominio propio: mandar con tu Gmail

Si no tenés dominio, la forma gratis más confiable es que Supabase mande los mails
**desde tu propia cuenta de Gmail**: salen de los servidores de Google y no los
rechazan. Límite: unos 500 mails por día, de sobra para un grupo de amigos.

1. En <https://myaccount.google.com/security> activá la **Verificación en dos pasos**
   (sin eso Google no deja crear contraseñas de aplicación).
2. Entrá a <https://myaccount.google.com/apppasswords> → nombre `Supabase EscabiARG` →
   **Crear** → copiá la contraseña de 16 letras (sin espacios). Se muestra una sola vez.
3. Supabase → **Authentication → Emails → SMTP Settings** (reemplaza lo de Brevo):

   | Campo | Valor |
   | --- | --- |
   | Sender email address | tu Gmail (el mismo de la cuenta) |
   | Sender name | `EscabiARG` |
   | Host | `smtp.gmail.com` |
   | Port number | `587` (si no anda, `465`) |
   | Username | tu Gmail completo |
   | Password | la contraseña de aplicación del paso 2 (no tu contraseña de Google) |

   **Save changes** y probá registrarte con un mail nuevo.
4. Los mails salen con tu dirección como remitente. Si cambiás la contraseña de Google,
   las contraseñas de aplicación se borran y hay que crear otra.

### 3.1.c Mails propios con SendGrid (pago)

> SendGrid ya **no tiene plan gratis** (lo retiró en mayo de 2025): las cuentas nuevas
> tienen una prueba de 60 días con un tope de 100 mails por día, y después es pago.

1. **Cuenta:** creá una en <https://sendgrid.com>.
2. **Remitente** (Settings → **Sender Authentication**), elegí una:
   - **Domain Authentication** (recomendado): si tenés un dominio propio (por ejemplo
     `escabiarg.com.ar`), SendGrid te da unos registros **CNAME** para cargar en el DNS
     de tu dominio. Con eso los mails llegan a la bandeja de entrada y no a spam.
   - **Single Sender Verification** (para probar rápido): verificás una sola dirección.
     Evitá usar una de Gmail/Hotmail como remitente: esos mails suelen ir a spam o
     rebotar. No se puede autenticar `netlify.app` porque no es tuyo.
3. **API key** (Settings → **API Keys** → **Create API Key**):
   - Nombre: `supabase-escabiarg`
   - Permisos: **Restricted Access** → **Mail Send: Full Access**
   - Copiala: **se muestra una sola vez**.
4. **Supabase** → **Authentication → Emails → SMTP Settings** → activá **custom SMTP**:

   | Campo | Valor |
   | --- | --- |
   | Sender email | el remitente verificado en el paso 2 (ej. `hola@escabiarg.com.ar`) |
   | Sender name | `EscabiARG` |
   | Host | `smtp.sendgrid.net` |
   | Port | `587` |
   | Username | `apikey` (literal, la palabra *apikey*) |
   | Password | la API key del paso 3 |

   Guardá.
5. **Límite de mails:** con SMTP propio Supabase arranca en unos **30 mails por hora**.
   Ajustalo en **Authentication → Rate Limits** (sin pasarte de lo que permite tu plan
   de SendGrid).
6. **Reactivá "Confirm email"** en **Sign In / Providers → Email**.
7. **Mail en español:** en **Authentication → Emails → Templates → Confirm signup**
   pegá el contenido de
   [`supabase/email-templates/confirmar-cuenta.html`](supabase/email-templates/confirmar-cuenta.html)
   y poné de asunto *"Confirmá tu cuenta de EscabiARG 🍺"*.
8. **Probá:** registrate con un mail nuevo desde la app. Tiene que llegar el mail;
   el link te devuelve a la app ya confirmado. En SendGrid → **Activity** ves si se
   envió, rebotó o se marcó como spam.

Si falla: revisá que el remitente esté verificado, que la API key tenga **Mail Send**,
que el usuario sea exactamente `apikey`, y probá el puerto `2525` si el `587` no anda.

### 3.2 Modo invitado

1. **Sign In / Providers** → activá **Allow anonymous sign-ins**.
2. (Recomendado más adelante) activá un captcha en **Attack Protection** para que no
   abusen creando invitados.

### 3.3 Google (opcional)

1. En [Google Cloud Console](https://console.cloud.google.com/) creá unas credenciales
   **OAuth client ID** de tipo **Web application**.
2. En **Authorized redirect URIs** poné la URL de callback que te muestra Supabase en
   **Sign In / Providers → Google** (es `https://TU-PROYECTO.supabase.co/auth/v1/callback`).
3. Pegá el **Client ID** y el **Client Secret** en Supabase y habilitá Google.
4. En Netlify (paso 5) poné `VITE_ENABLE_GOOGLE_AUTH=true`.

## 4. Copiar las claves de Supabase

En **Project Settings → API Keys** (o en el botón **Connect** de arriba):

- **Project URL**: `https://xxxxxxxx.supabase.co`
- **Publishable key**: empieza con `sb_publishable_…`
  (si tu proyecto muestra la clave vieja **anon**, también sirve).

> ⚠️ **Nunca** uses la **secret key** (`sb_secret_…`) ni la `service_role` en la app:
> esas saltean toda la seguridad. La publishable es pública a propósito: los datos
> los protegen las reglas (RLS) que creó el SQL.

## 5. Publicar en Netlify

1. Entrá a <https://app.netlify.com> → **Add new site** → **Import an existing project**.
2. Elegí **GitHub**, autorizá el acceso y seleccioná **`DaniBGA/EscabiARG`**.
3. Configuración del deploy (Netlify la toma sola de `netlify.toml`, revisá que diga esto):
   - **Branch to deploy:** `main`
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Antes de deployar, en **Environment variables** (o "Add environment variables")
   cargá:

   | Variable | Valor |
   | --- | --- |
   | `VITE_SUPABASE_URL` | la Project URL del paso 4 |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | la publishable key del paso 4 |
   | `VITE_ENABLE_DEMO` | `true` mientras prueban; `false` cuando la abran a todos |
   | `VITE_ENABLE_GOOGLE_AUTH` | `false` (o `true` si hiciste el 3.3) |

5. **Deploy**. En 1–2 minutos te da una URL tipo `https://nombre-raro.netlify.app`.
6. (Opcional) Cambiale el nombre: **Site configuration → Site details → Change site name**
   → `escabiarg` → queda `https://escabiarg.netlify.app` (si está libre).

> **Si el sitio ya existía en Netlify:** cargá las variables en
> **Site configuration → Environment variables** y después
> **Deploys → Trigger deploy → Clear cache and deploy site**. Las variables se meten
> en la app **al compilar**, así que sin un deploy nuevo no se aplican.

## 6. Decirle a Supabase cuál es tu sitio

Volvé a Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://escabiarg.netlify.app` (tu URL de Netlify)
- **Redirect URLs** → **Add URL**:
  - `https://escabiarg.netlify.app/**`
  - `http://localhost:5173/**` (para desarrollo en tu compu)

Sin esto, los links de los mails y el login con Google te mandan a `localhost`.

## 7. Probar que todo funcione

Hacelo desde el celular, que es donde se va a usar:

1. Abrí la URL de Netlify → se ve la animación de la cerveza → aparece el login.
2. **Continuar con email → Creá tu cuenta** → entrás al inicio.
3. En otro celular (o una ventana de incógnito) creá **otra cuenta**.
4. Con la primera: **Amigos** → copiá tu código. Con la segunda: agregalo por código.
5. Con la primera: **Crear viaje** (o **Previa y salida**) invitando a la segunda.
6. En el viaje → **Reglas → Usar carta sugerida** (trae también los que restan: agua,
   gaseosa sola, té de boldo y Alikal).
7. **Cargar trago** → elegí uno → **Abrir cámara** → el navegador te pide permiso
   para la cámara: **Permitir** → sacá la foto → cargalo.
8. Con la segunda cuenta entrá al viaje → **Pendientes** → mirá la foto → **Vale**.
   La primera cuenta suma los puntos.
9. En Supabase → **Storage → trip-photos** tiene que aparecer la foto.

Si todo eso anduvo, ya está online. 🍻

## 8. Antes de abrirla a todos

- Poné `VITE_ENABLE_DEMO=false` en Netlify y redeployá (así no aparece "Probar sin cuenta").
- Configurá un SMTP propio y reactivá **Confirm email** (paso 3.1).
- En el plan gratis, Supabase **pausa el proyecto si pasa ~1 semana sin uso**. Se
  reactiva desde el dashboard; para evitarlo hace falta un plan pago.
- Cada vez que hagas merge a `main`, Netlify publica la versión nueva solo.
- Si en el futuro hay migraciones nuevas en `supabase/migrations/`, hay que correrlas
  en el SQL Editor (en orden) **antes** de que llegue el deploy que las usa.

## Problemas comunes

| Síntoma | Qué pasa | Solución |
| --- | --- | --- |
| "El login todavía no está configurado" / solo aparece la demo | El build se hizo sin las variables | Cargá las variables y **Clear cache and deploy site** |
| "Invalid API key" al entrar | Clave mal copiada o de otro proyecto | Copiá de nuevo la publishable key del paso 4 |
| Se registran pero no les llega el mail | SMTP por defecto de Supabase | Desactivá **Confirm email** o configurá SMTP propio |
| Error **500** al crear la cuenta / "No pudimos mandarte el mail de confirmación" | Supabase no pudo mandar el mail (SMTP mal configurado) | Ver [Error 500 al registrarse](#error-500-al-registrarse) |
| "No pudimos crear tu cuenta por un error en la base de datos" | Falló el trigger que crea el perfil | Ver [Error 500 al registrarse](#error-500-al-registrarse) |
| "El modo invitado no está habilitado todavía" | Falta el interruptor | Paso 3.2 |
| "No tenés permiso para hacer eso" o errores de tablas que no existen | Falta correr el SQL | Paso 2 (o la migración que falte) |
| No se suben las fotos | Falta el bucket `trip-photos` | Corré la migración 2 (o el setup completo) |
| La cámara no abre | Permiso denegado | En el navegador: permisos del sitio → Cámara → Permitir. En iPhone: Ajustes → Safari → Cámara |
| Después de confirmar el mail te manda a `localhost` | Site URL sin configurar | Paso 6 |
| Las cuentas regresivas se ven corridas | Hora del celular muy desfasada | La app se sincroniza con el servidor; reiniciá la app |
| Lo que hacen los demás tarda unos segundos en aparecer (no es instantáneo) | Falta la migración de tiempo real, o Realtime está caído | Corré `20261110000000_tiempo_real.sql` (paso 2). En **Realtime → Inspector** podés ver si llegan mensajes a `trip:…` |

### Error 500 al registrarse

Si en la consola del navegador ves
`POST https://xxxx.supabase.co/auth/v1/signup … 500`, el problema está en Supabase,
no en Netlify. Para ver la causa exacta:

- **DevTools → Network** → tocá el pedido `signup` → pestaña **Response**, o
- **Supabase → Logs → Auth** (filtrá por `signup` o por `error`): ahí aparece el
  error completo, incluido lo que respondió el servidor de mails.

Según el mensaje:

**`Error sending confirmation email`** (el caso más común): Supabase intentó mandar el
mail y tu SMTP lo rechazó. La cuenta **no** se crea, por eso falla siempre.

1. Revisá **Authentication → Emails → SMTP Settings** campo por campo:

   | Proveedor | Host | Puerto | Username | Password |
   | --- | --- | --- | --- | --- |
   | SendGrid | `smtp.sendgrid.net` | `587` | `apikey` (literal) | la API key (`SG.…`) |
   | Brevo | `smtp-relay.brevo.com` | `587` | el **Login** de *SMTP & API → SMTP* (ej. `xxxx@smtp-brevo.com`) | la **SMTP key** (no la API key `xkeysib-…` ni tu contraseña) |
   | Resend | `smtp.resend.com` | `465` | `resend` | la API key (`re_…`) |

2. El **Sender email** tiene que ser exactamente un remitente/dominio **verificado** en
   el proveedor. Si no, el SMTP responde algo como
   `550 The from address does not match a verified Sender Identity` y Supabase lo
   muestra como 500.
3. Si al pegar la password quedó un espacio al principio o al final, borrala y pegala
   de nuevo.
4. Para confirmar que el problema es el SMTP: desactivá un momento **Confirm email**
   (Sign In / Providers → Email) y probá registrarte. Si así anda, el resto de la app
   está bien y solo falta arreglar el mail.

**`Database error saving new user`**: falló el trigger que crea el perfil
(`handle_new_user`).

1. **Logs → Postgres**: buscá el error de la misma hora (ahí dice qué falló).
2. Revisá en **Table Editor** que exista la tabla `profiles`. Si no está, corré el
   paso 2 (`setup_completo.sql`).
3. Si corriste las migraciones a mano, fijate de haberlas corrido **todas y en orden**.

**`Email address "…" cannot be used as it is not authorized`**: estás usando el SMTP
por defecto de Supabase, que solo manda mails al equipo de tu organización. Configurá un
SMTP propio o desactivá **Confirm email** (paso 3.1).

## Desarrollo en tu compu

```bash
npm install
cp .env.example .env.local   # completá VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:5173
```
