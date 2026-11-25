/**
 * Проверка и статистика банка вопросов (npm run bank).
 * Банк собирается во время выполнения из src/content/m14/questions.ts и блоков interview в уроках,
 * поэтому генерируемого файла нет: этот скрипт проверяет целостность и печатает покрытие по модулям.
 */
import { getBank } from '../src/content/bank.ts';
import { validateQuestions } from '../src/engine/interview.ts';
import { modules } from '../src/content/modules.ts';

const bank = await getBank();
const errs = validateQuestions(bank);
const TARGET = 150;

const byModule = new Map<string, number>();
for (const q of bank) byModule.set(q.module, (byModule.get(q.module) ?? 0) + 1);
const byKind = new Map<string, number>();
for (const q of bank) byKind.set(q.kind, (byKind.get(q.kind) ?? 0) + 1);

console.log(`Вопросов в банке: ${bank.length} (цель к релизу: ${TARGET})`);
for (const m of modules) console.log(`  m${String(m.num).padStart(2, '0')} ${m.title}: ${byModule.get(`m${String(m.num).padStart(2, '0')}`) ?? 0}`);
console.log('По типам:', [...byKind].map(([k, v]) => `${k}=${v}`).join(', '));
for (const e of errs) console.error('ERROR', e);
process.exit(errs.length ? 1 : 0);
