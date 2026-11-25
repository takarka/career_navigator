import { Chart } from '../components/Chart.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { DiagramCanvas } from '../components/DiagramCanvas.tsx';
import { LazyWidget } from '../components/widgets.tsx';
import { demoDiagram, demoTestExercise, demoTimeline } from '../content/demo.ts';
import { histogram, percentile } from '../engine/chart.ts';
import { href } from './router.ts';

// детерминированный «латентностный» набор: смесь быстрых и редких медленных запросов
const latencies = Array.from({ length: 200 }, (_, i) => 20 + ((i * 37) % 60) + (i % 25 === 0 ? 400 : 0));
const hist = histogram(latencies, 12);

export function DemoPage() {
  return (
    <div class="page">
      <nav class="crumbs"><a href={href.home()}>Главная</a> › Компоненты</nav>
      <h1>Демо общих компонентов</h1>
      <p class="lead">Страница для разработки и ручной проверки. Эти компоненты используются в уроках модулей 3, 8, 9, 10 и далее.</p>

      <h2>Timeline</h2>
      <Timeline spec={demoTimeline} id="demo-tl" />

      <h2>Chart</h2>
      <Chart title="Рост нагрузки" xLabel="RPS" yLabel="задержка, мс" series={[{ name: 'p50', points: [[100, 20], [200, 24], [300, 31], [400, 60], [500, 180]] }, { name: 'p99', points: [[100, 45], [200, 70], [300, 140], [400, 420], [500, 1500]] }]} />
      <Chart kind="bar" title="Гистограмма задержек" xLabel="корзина задержки, мс" yLabel="запросов" categories={hist.map((b) => String(Math.round(b.from)))} series={[{ name: `p50=${percentile(latencies, 50)}, p99=${percentile(latencies, 99)}`, points: hist.map((b, i) => [i, b.count] as [number, number]) }]} />

      <h2>DiagramCanvas</h2>
      <DiagramCanvas spec={demoDiagram} caption="Модель: простое правило каскада по синхронным связям. Реальные системы сложнее (таймауты, очереди запросов, пулы соединений)." />

      <h2>TestExercise</h2>
      <LazyWidget name="test-exercise" props={{ ex: demoTestExercise }} />
    </div>
  );
}
