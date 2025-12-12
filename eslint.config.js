import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default defineConfig(
  // Respect .gitignore
  includeIgnoreFile(gitignorePath),

  // Base JS rules (uses espree for JS files)
  js.configs.recommended,

  // Node globals for JS files
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },

  // Type-aware TypeScript rules applied ONLY to TS/TSX files
  // with projectService enabled to provide type info
  ...ts.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...(config.languageOptions?.parserOptions ?? {}),
        projectService: true
      },
      globals: { ...globals.node }
    }
  })),

  // Disable specific unsafe any checks for TS files
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off'
    }
  },

  // Ensure Prettier disables conflicting formatting rules (keep last)
  prettier,

  // Global rules/tweaks
  {
    rules: {
      // TS handles undefined vars; avoid false positives
      'no-undef': 'off'
    }
  },

  // Avoid applying TS type-aware rules to config files
  {
    files: ['eslint.config.js', '**/*.config.{js,cjs,mjs}'],
    rules: {
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off'
    }
  }
);