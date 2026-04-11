import tsParser from '@typescript-eslint/parser';

const forbiddenUiPattern = /\b(organization|cluster|context|scope)s?\b/i;
const identifierPattern = /^[a-z0-9_.-]+$/;

const flowOpsUiVocabularyPlugin = {
  rules: {
    'no-raw-system-terms': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          forbidden: 'Use LABELS or sanitizeLabel instead of raw system terms in UI copy.',
        },
      },
      create(context) {
        const shouldIgnoreLiteral = (node) => {
          const parentType = node.parent?.type;
          return parentType === 'ImportDeclaration'
            || parentType === 'ExportAllDeclaration'
            || parentType === 'ExportNamedDeclaration'
            || parentType === 'TSLiteralType';
        };

        const reportIfForbidden = (node, value) => {
          const text = typeof value === 'string' ? value.trim() : '';
          if (!text) return;
          if (identifierPattern.test(text)) return;
          if (!forbiddenUiPattern.test(text)) return;

          context.report({ node, messageId: 'forbidden' });
        };

        return {
          Literal(node) {
            if (shouldIgnoreLiteral(node)) return;
            if (typeof node.value === 'string') {
              reportIfForbidden(node, node.value);
            }
          },
          JSXText(node) {
            reportIfForbidden(node, node.value);
          },
          TemplateElement(node) {
            reportIfForbidden(node, node.value.cooked ?? node.value.raw);
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'supabase/**'],
  },
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/context/NotificationContext.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      flowops: flowOpsUiVocabularyPlugin,
    },
    rules: {
      'flowops/no-raw-system-terms': 'error',
    },
  },
  {
    files: ['src/context/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
];