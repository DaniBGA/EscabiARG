# EscabiARG 🍺

La app para tomar con amigos.

## Stack

- [Vite](https://vite.dev/) + React + TypeScript
- Deploy en [Netlify](https://www.netlify.com/) (config en `netlify.toml`)

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # genera /dist
npm run preview # sirve el build localmente
```

## Estado actual

- **Pantalla de carga**: animación a pantalla completa de un vaso de cerveza llenándose
  (chorro, burbujas y espuma). Se puede saltear tocando la pantalla y respeta
  `prefers-reduced-motion`.
- **Opciones de logueo**: Google, email e invitado (solo UI, todavía sin autenticación).

## Deploy en Netlify

Conectá el repo en Netlify; toma automáticamente `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
