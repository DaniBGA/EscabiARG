/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ENABLE_GOOGLE_AUTH?: string
  readonly VITE_ENABLE_DEMO?: string
  /** 'true' = versión early access: se entra solo como invitado y hay cupo */
  readonly VITE_EARLY_ACCESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
