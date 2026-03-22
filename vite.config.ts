import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: chunkInfo => `assets/${renameChunk(chunkInfo.name)}.js`,
        entryFileNames: chunkInfo => `assets/${renameChunk(chunkInfo.name)}.js`,
        assetFileNames: assetInfo => {
          const originalName = assetInfo.name ?? 'asset';
          const extension = path.extname(originalName);
          const baseName = path.basename(originalName, extension);

          if (extension === '.css') {
            if (normalizeName(baseName).startsWith('index')) {
              return 'assets/styles.css';
            }

            return `assets/${renameChunk(baseName)}.css`;
          }

          return `assets/${renameChunk(baseName)}${extension}`;
        },
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('/react/') ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          ) {
            return 'system-core';
          }

          if (id.includes('/@supabase/')) return 'db-client';

          if (
            id.includes('/recharts/') ||
            id.includes('/victory-vendor/') ||
            id.includes('/d3-') ||
            id.includes('/d3/')
          ) {
            return 'data-viz';
          }

          if (id.includes('papaparse')) return 'data-export';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('date-fns')) return 'date-utils';

          if (
            id.includes('clsx') ||
            id.includes('tailwind-merge') ||
            id.includes('uuid')
          ) {
            return 'core-utils';
          }

          return 'partner';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
