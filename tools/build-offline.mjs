// Сборка dist-offline: копия dist (все ресурсы, включая WASM для SQL, локальные) + serve.mjs + README.
// Запуск: npm run build:offline. Затем: cd dist-offline && node serve.mjs
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('npm run build', { stdio: 'inherit' });
if (existsSync('dist-offline')) rmSync('dist-offline', { recursive: true });
mkdirSync('dist-offline');
cpSync('dist', 'dist-offline/site', { recursive: true });
let serve = readFileSync('tools/serve.mjs', 'utf8');
serve = serve.replace("process.argv[2] ?? 'dist'", "process.argv[2] ?? new URL('./site', import.meta.url).pathname");
writeFileSync('dist-offline/serve.mjs', serve);
writeFileSync('dist-offline/README.txt', 'Полностью офлайн-режим (включая SQL-песочницу).\nТребуется Node.js 22+.\n\n  node serve.mjs [папка] [порт]\n\nЗатем откройте http://127.0.0.1:4173/\n');
console.log('dist-offline готов');
