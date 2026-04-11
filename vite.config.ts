import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const chunkRenameRules: Array<[prefix: string, replacement: string]> = [
  ['briefflowoverview', 'summary-panel'],
  ['collapsibletablesection', 'table-section'],
  ['contextbreadcrumbs', 'nav-context'],
  ['dashboardcharts', 'dashboard-viz'],
  ['dataactionmenu', 'actions-menu'],
  ['emptystate', 'empty-state'],
  ['mobilerecordcard', 'mobile-card'],
  ['entitysnapshot', 'entity-view'],
  ['workspacedetail', 'workspace-view'],
  ['contactsoverview', 'contacts'],
  ['contacts', 'contacts-core'],
  ['reserve', 'reserve-core'],
  ['dashboard', 'dashboard-core'],
  ['unitdetail', 'unit-view'],
  ['units', 'units'],
  ['workspaces', 'workspaces'],
  ['app-utils', 'core-utils'],
  ['framework', 'system-core'],
  ['supabase', 'db-client'],
  ['charts', 'data-viz'],
  ['csv', 'data-export'],
  ['index', 'main'],
];

const normalizeName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9-]/g, '');

const renameChunk = (name: string): string => {
  const normalized = normalizeName(name);

  for (const [prefix, replacement] of chunkRenameRules) {
    if (normalized.startsWith(prefix)) {
      return replacement;
    }
  }

  return name;
};

function supabasePreconnectPlugin(origin: string): Plugin {
  return {
    name: 'inject-supabase-preconnect',
    transformIndexHtml(html) {
      if (!origin) return html;
      const line = `    <link rel="preconnect" href="${origin}" crossorigin />\n`;
      return html.replace('<head>', `<head>\n${line}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  let supabaseOrigin = '';
  if (env.VITE_SUPABASE_PRECONNECT !== 'false' && env.VITE_SUPABASE_URL) {
    try {
      supabaseOrigin = new URL(env.VITE_SUPABASE_URL).origin;
    } catch {
      supabaseOrigin = '';
    }
  }

  return {
    plugins: [react(), tailwindcss(), supabasePreconnectPlugin(supabaseOrigin)],
    /** Broader than `esnext` so older Android System WebView / Chrome on tablets can run the bundle. */
    esbuild: {
      target: ['es2020', 'chrome87', 'safari14', 'firefox90', 'edge88'],
    },
    build: {
      target: ['es2020', 'chrome87', 'safari14', 'firefox90', 'edge88'],
      minify: 'esbuild',
      sourcemap: false,
      reportCompressedSize: false,
      /** Parallel preloads for static entry imports; leave default (true) for faster time-to-interactive. */
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          chunkFileNames: chunkInfo => `assets/${renameChunk(chunkInfo.name)}-[hash].js`,
          entryFileNames: chunkInfo => `assets/${renameChunk(chunkInfo.name)}-[hash].js`,
          assetFileNames: assetInfo => {
            const originalName = assetInfo.name ?? 'asset';
            const extension = path.extname(originalName);
            const baseName = path.basename(originalName, extension);

            if (extension === '.css') {
              if (normalizeName(baseName).startsWith('index')) {
                return 'assets/styles-[hash].css';
              }

              return `assets/${renameChunk(baseName)}-[hash].css`;
            }

            return `assets/${renameChunk(baseName)}-[hash]${extension}`;
          },
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (
              id.includes('/react/') ||
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.includes('scheduler')
            ) {
              return 'framework';
            }

            if (id.includes('/lucide-react/')) return 'icons';
            if (id.includes('/@supabase/')) return 'db';

            if (
              id.includes('/recharts/') ||
              id.includes('/victory-vendor/') ||
              id.includes('/d3-') ||
              id.includes('/d3/')
            ) {
              return 'data-viz';
            }

            if (id.includes('papaparse')) return 'data-export';
            if (id.includes('date-fns')) return 'date-utils';

            if (
              id.includes('clsx') ||
              id.includes('tailwind-merge') ||
              id.includes('uuid')
            ) {
              return 'core-utils';
            }

            return 'vendor';
          },
        },
      },
    },
    test: {
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      environment: 'jsdom',
      globals: true,
    },
  };
});
