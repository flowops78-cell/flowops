#!/usr/bin/env node
/**
 * Push to GitHub using GITHUB_TOKEN from .env / .env.local (see load-env.mjs).
 * Parses owner/repo from `git remote get-url origin`.
 *
 * Usage:
 *   npm run git:push
 *   npm run git:push -- main
 *   npm run git:push -- main --force
 */
import { spawnSync } from 'node:child_process';
import { loadEnv, REPO_ROOT } from './debug/load-env.mjs';

loadEnv(REPO_ROOT);
const token = process.env.GITHUB_TOKEN?.trim();
if (!token) {
  console.error('Missing GITHUB_TOKEN. Add it to .env (see .env.example).');
  process.exit(1);
}

process.chdir(REPO_ROOT);

const originResult = spawnSync('git', ['remote', 'get-url', 'origin'], {
  encoding: 'utf8',
  cwd: REPO_ROOT,
});
if (originResult.status !== 0 || !originResult.stdout?.trim()) {
  console.error('Could not read git remote origin.');
  process.exit(1);
}
const origin = originResult.stdout.trim();
const match = origin.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
if (!match) {
  console.error('Origin must be a github.com URL:', origin);
  process.exit(1);
}
const [, owner, repo] = match;
const pushUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

const argv = process.argv.slice(2);
let branchResult = spawnSync('git', ['branch', '--show-current'], {
  encoding: 'utf8',
  cwd: REPO_ROOT,
});
let branch = branchResult.stdout?.trim() || 'main';
let forward = argv;
if (argv.length > 0 && !argv[0].startsWith('-')) {
  branch = argv[0];
  forward = argv.slice(1);
}

const gitArgs = ['push', pushUrl, `HEAD:${branch}`, ...forward];
const r = spawnSync('git', gitArgs, { stdio: 'inherit', cwd: REPO_ROOT });
process.exit(r.status ?? 1);
