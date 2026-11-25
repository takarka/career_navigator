import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAllLessons, lessonLoaders } from './lessons.ts';
import { runSuiteLocal } from '../engine/testharness.ts';
import type { Exercise, TestExercise } from './types.ts';

const dir = mkdtempSync(join(tmpdir(), 'lesson-ex-'));

const testExercises: { id: string; ex: TestExercise }[] = [];
const exercises: { id: string; ex: Exercise }[] = [];
const allLessons = await loadAllLessons();
for (const l of allLessons) {
  for (const b of l.blocks) {
    if (b.t !== 'task') continue;
    if (b.task.testExercise) testExercises.push({ id: b.task.id, ex: b.task.testExercise });
    if (b.task.exercise) exercises.push({ id: b.task.id, ex: b.task.exercise });
  }
}

describe('реестр уроков', () => {
  it('id урока совпадает с ключом реестра', () => {
    expect(allLessons.map((l) => l.id).sort()).toEqual(Object.keys(lessonLoaders).sort());
  });
});

describe('оракул упражнений: решения проходят, заготовки не проходят', () => {
  for (const { id, ex } of testExercises) {
    it(`TestExercise ${id}: решение проходит все тесты`, async () => {
      expect(ex.solution, 'нужно решение').toBeTruthy();
      const res = await runSuiteLocal(ex.solution!, ex.tests, ex.timeoutMs ?? 2000);
      expect(res.filter((r) => !r.ok)).toEqual([]);
    });
    it(`TestExercise ${id}: заготовка не проходит хотя бы один тест`, async () => {
      const res = await runSuiteLocal(ex.starter, ex.tests, 300);
      expect(res.some((r) => !r.ok)).toBe(true);
    });
  }

  for (const { id, ex } of exercises) {
    if (!ex.solution) continue;
    it(`Exercise ${id}: решение в реальном Node даёт ожидаемый вывод`, () => {
      const file = join(dir, `${id}.cjs`);
      writeFileSync(file, ex.solution!);
      const out = execFileSync(process.execPath, [file], { encoding: 'utf8' }).trim().split('\n');
      expect(out).toEqual(ex.expected);
    });
  }
});
