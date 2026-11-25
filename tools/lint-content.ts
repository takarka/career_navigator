// Линтер контента: целостность и полнота готовых уроков (раздел 11.3 HANDOFF).
import { existsSync, readFileSync } from 'node:fs';
import { modules } from '../src/content/modules.ts';
import { loadAllLessons } from '../src/content/lessons.ts';
import { lessonLoaders } from '../src/content/lessons.ts';
import { datasets } from '../src/content/m03/datasets.ts';
import { widgetLoaders } from '../src/components/widgets.tsx';
import { blockText } from '../src/content/text.ts';
import type { Block, Task } from '../src/content/types.ts';

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);

const openQuestions = existsSync('docs/open-questions.md') ? readFileSync('docs/open-questions.md', 'utf8') : '';

// --- оглавление
const refIds = new Set<string>();
for (const m of modules) {
  for (const l of m.lessons) {
    if (refIds.has(l.id)) err('modules.ts', `повторяющийся id урока ${l.id}`);
    refIds.add(l.id);
    if (!l.id.startsWith(m.id + '-')) err('modules.ts', `урок ${l.id} не принадлежит модулю ${m.id}`);
  }
}

const taskIds = new Set<string>();
const quizIds = new Set<string>();

function checkTask(where: string, t: Task) {
  if (taskIds.has(t.id)) err(where, `повторяющийся id задачи ${t.id}`);
  taskIds.add(t.id);
  if (!t.mode) err(where, `задача ${t.id}: нет mode`);
  if (!t.summary?.trim()) err(where, `задача ${t.id}: нет summary`);
  if (t.mode === 'local' || t.mode === 'hybrid') {
    if (!t.commands?.length) err(where, `задача ${t.id}: для ${t.mode} нужны commands`);
    if (!t.expected?.trim()) err(where, `задача ${t.id}: для ${t.mode} нужен expected`);
  }
  if (t.exercise) {
    if (!t.exercise.expected?.length) err(where, `задача ${t.id}: у exercise нет expected`);
    if ((t.hints?.length ?? 0) < 2) err(where, `задача ${t.id}: у exercise нужно минимум 2 подсказки`);
  }
  if (t.sqlExercise) {
    const e = t.sqlExercise;
    if (!datasets[e.dataset]) err(where, `задача ${t.id}: неизвестный датасет ${e.dataset}`);
    if (!e.solution?.trim()) err(where, `задача ${t.id}: у sqlExercise нет solution`);
    if ((e.kind ?? 'result') === 'result' && !e.expected) err(where, `задача ${t.id}: у sqlExercise kind=result нужен expected`);
    if (e.kind === 'plan' && (!e.planQuery || !e.planNode)) err(where, `задача ${t.id}: у sqlExercise kind=plan нужны planQuery и planNode`);
    if ((t.hints?.length ?? 0) < 2) err(where, `задача ${t.id}: у sqlExercise нужно минимум 2 подсказки`);
  }
  if (t.testExercise) {
    if (!t.testExercise.tests.length) err(where, `задача ${t.id}: у testExercise нет тестов`);
    if ((t.hints?.length ?? 0) < 2) err(where, `задача ${t.id}: у testExercise нужно минимум 2 подсказки`);
  }
  if (t.widget && !widgetLoaders[t.widget.name]) err(where, `задача ${t.id}: виджет «${t.widget.name}» не зарегистрирован`);
}

const lessons = Object.fromEntries((await loadAllLessons()).map((l) => [l.id, l]));
for (const [id, lesson] of Object.entries(lessons)) {
  const where = `lesson ${id}`;
  if (!refIds.has(lesson.id)) err(where, 'нет в modules.ts');
  if (!(id in lessonLoaders)) err(where, 'нет в реестре lessons.ts');

  const blocks = lesson.blocks;
  const widgetsN = blocks.filter((b) => b.t === 'widget').length;
  const sandboxTasks = blocks.filter((b) => b.t === 'task' && (b.task.exercise || b.task.testExercise || b.task.sqlExercise || b.task.widget?.name === 'sandbox')).length;
  if (widgetsN + sandboxTasks < 1) err(where, 'нужен минимум один widget или sandbox-задача');
  if (blocks.filter((b) => b.t === 'interview').length < 2) err(where, 'нужно минимум 2 блока interview');
  if (!blocks.some((b) => b.t === 'task')) err(where, 'нужна минимум одна task');
  const quizzes = blocks.filter((b): b is Extract<Block, { t: 'quiz' }> => b.t === 'quiz');
  if (!quizzes.some((q) => q.questions.length >= 5)) err(where, 'нужен quiz минимум из 5 вопросов');

  for (const b of blocks) {
    if (b.t === 'widget' && !widgetLoaders[b.name]) err(where, `виджет «${b.name}» не зарегистрирован`);
    if (b.t === 'task') checkTask(where, b.task);
    if (b.t === 'quiz') {
      if (quizIds.has(b.id)) err(where, `повторяющийся id теста ${b.id}`);
      quizIds.add(b.id);
      b.questions.forEach((q, i) => {
        const w = `${where} quiz ${b.id} #${i + 1}`;
        if (!q.explain?.trim()) err(w, 'нет explain');
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) err(w, 'answer вне диапазона options');
        if (q.options.length < 2) err(w, 'меньше двух вариантов');
      });
      if (b.questions.length >= 3 && new Set(b.questions.map((q) => q.answer)).size < 2) err(`${where} quiz ${b.id}`, 'все правильные ответы на одной позиции');
    }
    const text = blockText(b);
    if (/\bTODO\b|lorem ipsum|FIXME/i.test(text)) err(where, 'найден TODO/lorem/FIXME');
    if (/\[уточнить[^\]]*\]/i.test(text) && !openQuestions.includes(id)) warn(where, 'есть маркер [уточнить], но нет записи в docs/open-questions.md');
    for (const m of text.matchAll(/\blabs\/[\w./-]+/g)) {
      const p = m[0].replace(/[.,;:)]+$/, '');
      if (!existsSync(p)) err(where, `ссылка на несуществующий путь ${p}`);
    }
  }
}

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`lint:content — уроков: ${Object.keys(lessons).length}, ошибок: ${errors.length}, предупреждений: ${warnings.length}`);
process.exit(errors.length ? 1 : 0);
