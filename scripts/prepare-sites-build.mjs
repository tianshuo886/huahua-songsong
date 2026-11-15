#!/usr/bin/env node
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const client = path.join(dist, 'client');
const server = path.join(dist, 'server');
const hosting = path.join(dist, '.openai');

const required = [
  'public/index.html',
  'public/js/app.js',
  'public/js/model.js',
  'public/js/solar.js',
  'public/css/app.css',
  'worker/index.js',
  '.openai/hosting.json',
];

for (const rel of required) {
  await stat(path.join(root, rel));
}

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await mkdir(hosting, { recursive: true });

await cp(path.join(root, 'public'), client, {
  recursive: true,
  filter(source) {
    const rel = path.relative(root, source).split(path.sep).join('/');
    return rel !== 'public/img/_source' && rel !== 'public/icons/candidates';
  },
});
await cp(path.join(root, 'worker/index.js'), path.join(server, 'index.js'));
await cp(path.join(root, '.openai/hosting.json'), path.join(hosting, 'hosting.json'));

const versionFiles = [
  'public/js/app.js',
  'public/js/model.js',
  'public/js/solar.js',
  'public/css/app.css',
];
const hash = createHash('sha256');
for (const rel of versionFiles) {
  hash.update(await readFile(path.join(root, rel)));
}
await writeFile(
  path.join(client, 'version.json'),
  JSON.stringify({ v: hash.digest('hex').slice(0, 16) }) + '\n',
);

const index = await stat(path.join(client, 'index.html'));
const worker = await stat(path.join(server, 'index.js'));
if (!index.isFile() || !worker.isFile()) throw new Error('Sites 构建产物不完整');

console.log('Sites 构建完成：dist/client、dist/server/index.js、dist/.openai/hosting.json');
