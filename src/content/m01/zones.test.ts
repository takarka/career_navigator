import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zoneItems } from './zones.ts';

/** Оракул: классификация «куда пойдёт операция» сверяется с реальным Node (см. labs/m01/threadpool/zones.cjs). */
describe('оракул зон выполнения', () => {
  it('операции из пула ждут занятый пул, остальные завершаются сразу', { retry: 2, timeout: 60000 }, () => {
    const script = join(import.meta.dirname, '..', '..', '..', 'labs', 'm01', 'threadpool', 'zones.cjs');
    const times = JSON.parse(execFileSync(process.execPath, [script, '--json'], { encoding: 'utf8' })) as Record<string, number>;
    const busy = times['crypto.pbkdf2'];
    expect(busy).toBeGreaterThan(100);
    for (const item of zoneItems.filter((i) => i.probe)) {
      const t = times[item.probe!];
      expect(t, `нет замера ${item.probe}`).toBeDefined();
      if (item.zone === 'pool') expect(t, `${item.label} должен ждать пул`).toBeGreaterThan(busy * 0.8);
      else expect(t, `${item.label} не должен ждать пул`).toBeLessThan(busy * 0.5);
    }
  });

  it('у каждой зоны есть примеры и у каждого элемента объяснение', () => {
    for (const z of ['main', 'pool', 'os'] as const) expect(zoneItems.some((i) => i.zone === z)).toBe(true);
    expect(zoneItems.every((i) => i.why.length > 20)).toBe(true);
  });
});
