/**
 * Запуск пользовательского JS в изолированном Web Worker с таймаутом.
 * Внутри воркера работают те же Promise, queueMicrotask и setTimeout,
 * что и в Node.js (но нет process.nextTick и setImmediate).
 */

const workerSource = `
self.onmessage = async (e) => {
  const logs = [];
  const fmt = (a) => a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  const fakeConsole = { log: (...a) => logs.push(fmt(a)), error: (...a) => logs.push('error: ' + fmt(a)), warn: (...a) => logs.push('warn: ' + fmt(a)) };
  let error = null;
  self.addEventListener('unhandledrejection', (ev) => { error = 'Необработанный reject: ' + (ev.reason && ev.reason.message || ev.reason); });
  try {
    const fn = new Function('console', e.data.code);
    fn(fakeConsole);
  } catch (err) {
    error = String(err && err.message || err);
  }
  await new Promise((r) => setTimeout(r, e.data.settleMs));
  self.postMessage({ logs, error });
};
`;

export interface RunResult {
  logs: string[];
  error: string | null;
  timedOut: boolean;
}

export function runJs(code: string, settleMs = 200, limitMs = 3000): Promise<RunResult> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const done = (r: RunResult) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done({ logs: [], error: 'Превышено время выполнения (возможен бесконечный цикл)', timedOut: true }), limitMs + settleMs);
    worker.onmessage = (e) => done({ logs: e.data.logs, error: e.data.error, timedOut: false });
    worker.onerror = (e) => done({ logs: [], error: e.message, timedOut: false });
    worker.postMessage({ code, settleMs });
  });
}
