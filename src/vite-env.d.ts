/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_TERMINOLOGY_MODE?: 'discreet' | 'internal';
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
