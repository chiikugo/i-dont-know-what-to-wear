/// <reference types="vite/client" />

/**
 * Tell TypeScript about the environment variables this app reads.
 * They are set in `.env.local` (see `.env.example`). Anything starting with
 * VITE_ is bundled into the page — which is fine for the Supabase URL and the
 * public "anon" key, and is NOT fine for secret keys (never put a
 * `service_role` key here).
 */
interface ImportMetaEnv {
  /** Your Supabase project URL, e.g. https://abcdxyz.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Your Supabase project's public "anon" API key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
