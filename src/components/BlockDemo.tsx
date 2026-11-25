import { useEffect, useRef, useState } from 'preact/hooks';

const WORK_MS = 1500;

const workerSource = `
self.onmessage = (e) => {
  const end = Date.now() + e.data;
  let x = 0;
  while (Date.now() < end) x += Math.sqrt(x + 1);
  self.postMessage(x);
};`;

/** Живая демонстрация блокировки: счётчик кадров замирает, пока тяжёлая работа идёт в главном потоке, и не замирает в Web Worker. */
export function BlockDemo() {
  const [frames, setFrames] = useState(0);
  const [status, setStatus] = useState('Готово к запуску');
  const [busy, setBusy] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    const loop = () => {
      setFrames((f) => f + 1);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const inMain = () => {
    setBusy(true);
    setStatus('Считаю в главном потоке… страница не отвечает');
    // даём браузеру отрисовать статус, затем блокируем поток
    setTimeout(() => {
      const end = Date.now() + WORK_MS;
      let x = 0;
      while (Date.now() < end) x += Math.sqrt(x + 1);
      setStatus(`Главный поток: готово за ${WORK_MS} мс. Счётчик кадров стоял всё это время.`);
      setBusy(false);
    }, 50);
  };

  const inWorker = () => {
    setBusy(true);
    setStatus('Считаю в Web Worker… страница отвечает');
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = () => {
      w.terminate();
      URL.revokeObjectURL(url);
      setStatus(`Web Worker: готово за ${WORK_MS} мс. Счётчик кадров шёл всё это время.`);
      setBusy(false);
    };
    w.postMessage(WORK_MS);
  };

  return (
    <div class="blockdemo">
      <p>Кадров отрисовано: <b data-testid="frames">{frames}</b></p>
      <div class="row">
        <button onClick={inMain} disabled={busy}>Посчитать в главном потоке</button>
        <button class="primary" onClick={inWorker} disabled={busy}>Посчитать в Web Worker</button>
      </div>
      <p aria-live="polite">{status}</p>
      <p class="muted">Это настоящее исполнение в браузере, а не модель. Идея та же, что в Node.js: тяжёлый синхронный код в главном потоке останавливает всё остальное; <code>worker_threads</code> в Node.js играет роль Web Worker.</p>
    </div>
  );
}
