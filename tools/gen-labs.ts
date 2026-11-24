/**
 * Генерирует файлы лаборатории модуля 1 из тех же сценариев, что и симулятор.
 * Запуск: npm run gen:labs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, toSource } from '../src/engine/eventloop.ts';
import { scenarios } from '../src/content/m01/scenarios.ts';

const dir = join(import.meta.dirname, '..', 'labs', 'm01', 'event-loop');
mkdirSync(dir, { recursive: true });

const rows: string[] = [];
scenarios.forEach((s, i) => {
  const name = `${String(i + 1).padStart(2, '0')}-${s.id}.cjs`;
  const header = `// Сценарий: ${s.title}\n// Запуск: node ${name}\n\n`;
  writeFileSync(join(dir, name), header + toSource(s.ops) + '\n');
  const out = simulate(s.ops).log.join(' → ');
  rows.push(
    `<details><summary><code>${name}</code> — ${s.title}${s.deterministic ? '' : ' (порядок не гарантирован)'}</summary>\n\n` +
      `Порядок в модели: ${out}\n\n</details>`,
  );
});

writeFileSync(
  join(dir, 'README.md'),
  `# Лаборатория: event loop

Файлы сгенерированы из сценариев учебника (\`npm run gen:labs\`). Не правь их вручную.

1. Сначала предскажи вывод каждого файла.
2. Затем запусти его: \`node 01-basics.cjs\`.
3. Сверься с порядком в модели ниже (раскрой нужный пункт).

Автотесты проекта (\`npm test\`) запускают те же сценарии в реальном Node и сравнивают с моделью.

${rows.join('\n\n')}
`,
);
console.log(`Сгенерировано файлов: ${scenarios.length} → ${dir}`);
