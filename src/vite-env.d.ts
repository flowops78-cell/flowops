/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_TERMINOLOGY_MODE?: 'discreet' | 'internal';
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
