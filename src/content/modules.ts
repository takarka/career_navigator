import type { Module } from './types.ts';

const L = (m: string, n: number, title: string, summary?: string) => ({
  id: `${m}-l${String(n).padStart(2, '0')}`,
  title,
  summary,
});

export const modules: Module[] = [
  {
    id: 'm00', num: 0, title: 'Диагностика и окружение', priority: 'base',
    summary: 'Самооценка по требованиям вакансии и рабочее окружение для практики.',
    lessons: [L('m00', 1, 'Карта пробелов и самооценка'), L('m00', 2, 'Рабочее окружение: Node, Docker, compose')],
  },
  {
    id: 'm01', num: 1, title: 'Node.js: ядро и асинхронная модель', priority: 'critical',
    summary: 'Event loop, блокировки, Events, Streams, ошибки и graceful shutdown.',
    lessons: [
      L('m01', 1, 'Архитектура Node.js: V8, libuv, thread pool'),
      L('m01', 2, 'Event loop: фазы, nextTick и микрозадачи', 'Интерактивный симулятор и игра «угадай вывод»'),
      L('m01', 3, 'Блокировка event loop и worker threads'),
      L('m01', 4, 'Events: EventEmitter'),
      L('m01', 5, 'Streams и backpressure'),
      L('m01', 6, 'Ошибки и graceful shutdown'),
    ],
  },
  {
    id: 'm02', num: 2, title: 'JavaScript и TypeScript', priority: 'high',
    summary: 'Продвинутый JS, async-паттерны, TypeScript, декораторы.',
    lessons: [L('m02', 1, 'Замыкания, this, прототипы'), L('m02', 2, 'Async-паттерны и Promise-комбинаторы'), L('m02', 3, 'TypeScript: типы, generics, utility types'), L('m02', 4, 'Декораторы')],
  },
  {
    id: 'm03', num: 3, title: 'PostgreSQL', priority: 'critical',
    summary: 'Схема, индексы, транзакции, изоляция, EXPLAIN ANALYZE, миграции.',
    lessons: [L('m03', 1, 'Проектирование схемы'), L('m03', 2, 'Индексы и B-tree'), L('m03', 3, 'Транзакции, ACID, MVCC'), L('m03', 4, 'Уровни изоляции'), L('m03', 5, 'Блокировки и дедлоки'), L('m03', 6, 'EXPLAIN ANALYZE'), L('m03', 7, 'Пагинация, миграции, работа из Node.js')],
  },
  {
    id: 'm04', num: 4, title: 'Redis', priority: 'high',
    summary: 'Структуры данных, кэширование, инвалидация, rate limiting.',
    lessons: [L('m04', 1, 'Структуры данных Redis'), L('m04', 2, 'Cache-aside и стратегии кэша'), L('m04', 3, 'Инвалидация и проблемы кэша'), L('m04', 4, 'Rate limiting'), L('m04', 5, 'Атомарность и блокировки')],
  },
  {
    id: 'm05', num: 5, title: 'REST API и WebSocket', priority: 'high',
    summary: 'Проектирование API, идемпотентность, авторизация, WebSocket.',
    lessons: [L('m05', 1, 'REST и идемпотентность'), L('m05', 2, 'Формат ошибок и валидация'), L('m05', 3, 'Авторизация и JWT'), L('m05', 4, 'OpenAPI'), L('m05', 5, 'WebSocket')],
  },
  {
    id: 'm06', num: 6, title: 'NestJS', priority: 'critical',
    summary: 'Модули, DI, жизненный цикл запроса, DTO, конфигурация.',
    lessons: [L('m06', 1, 'Модули и DI'), L('m06', 2, 'Жизненный цикл запроса'), L('m06', 3, 'DTO и валидация'), L('m06', 4, 'БД и конфигурация'), L('m06', 5, 'NestJS и Express')],
  },
  {
    id: 'm07', num: 7, title: 'Docker и docker compose', priority: 'medium',
    summary: 'Образы, слои, multi-stage, compose, healthcheck.',
    lessons: [L('m07', 1, 'Dockerfile для Node.js'), L('m07', 2, 'Multi-stage и размер образа'), L('m07', 3, 'docker compose')],
  },
  {
    id: 'm08', num: 8, title: 'Брокеры сообщений', priority: 'critical',
    summary: 'RabbitMQ, Kafka, гарантии доставки, ретраи, DLQ, Outbox, Saga.',
    lessons: [L('m08', 1, 'Зачем нужны брокеры'), L('m08', 2, 'RabbitMQ'), L('m08', 3, 'Kafka'), L('m08', 4, 'Гарантии доставки'), L('m08', 5, 'Идемпотентный consumer'), L('m08', 6, 'Ретраи и DLQ'), L('m08', 7, 'Outbox и Inbox'), L('m08', 8, 'Saga')],
  },
  {
    id: 'm09', num: 9, title: 'Архитектура', priority: 'high',
    summary: 'Микросервисы, SOLID, отказоустойчивость, масштабирование.',
    lessons: [L('m09', 1, 'Монолит и микросервисы'), L('m09', 2, 'SOLID и DRY'), L('m09', 3, 'Отказоустойчивость'), L('m09', 4, 'Масштабирование'), L('m09', 5, 'Наблюдаемость')],
  },
  {
    id: 'm10', num: 10, title: 'Производительность', priority: 'high',
    summary: 'Метрики, профилирование, нагрузочное тестирование, утечки памяти.',
    lessons: [L('m10', 1, 'Метрики и перцентили'), L('m10', 2, 'Нагрузочное тестирование'), L('m10', 3, 'Профилирование'), L('m10', 4, 'Утечки памяти')],
  },
  {
    id: 'm11', num: 11, title: 'Тестирование', priority: 'medium',
    summary: 'Пирамида тестов, моки, интеграционные тесты.',
    lessons: [L('m11', 1, 'Пирамида тестов'), L('m11', 2, 'Моки, стабы, спаи'), L('m11', 3, 'Интеграционные тесты')],
  },
  {
    id: 'm12', num: 12, title: 'Интеграции: SOAP, ШЭП, Kalkan', priority: 'high',
    summary: 'SOAP, WSDL, ЭЦП, сертификаты, интеграция с госсистемами.',
    lessons: [L('m12', 1, 'SOAP и WSDL'), L('m12', 2, 'SOAP из Node.js'), L('m12', 3, 'ШЭП: каналы'), L('m12', 4, 'XML-DSig и CMS'), L('m12', 5, 'Kalkan и сертификаты'), L('m12', 6, 'Надёжность интеграций')],
  },
  {
    id: 'm13', num: 13, title: 'Capstone: сквозной проект', priority: 'critical',
    summary: 'Мини-проект, который собирает все темы в одну историю.',
    lessons: [L('m13', 1, 'Дизайн проекта'), L('m13', 2, 'Реализация и презентация')],
  },
  {
    id: 'm14', num: 14, title: 'Подготовка к собеседованию', priority: 'critical',
    summary: 'Рассказ о себе, STAR-истории, live coding, system design, мок-интервью.',
    lessons: [L('m14', 1, 'Рассказ о себе и ответ «почему Middle»'), L('m14', 2, 'Истории STAR'), L('m14', 3, 'Live coding и system design'), L('m14', 4, 'Зарплата и вопросы работодателю'), L('m14', 5, 'Мок-интервью')],
  },
];

export const priorityLabel: Record<Module['priority'], string> = {
  critical: 'критично',
  high: 'высокий',
  medium: 'средний',
  base: 'база',
};

export function findLessonRef(id: string) {
  for (const m of modules) {
    const idx = m.lessons.findIndex((l) => l.id === id);
    if (idx >= 0) return { module: m, ref: m.lessons[idx], index: idx };
  }
  return undefined;
}

export function flatLessons() {
  return modules.flatMap((m) => m.lessons.map((l) => ({ module: m, ref: l })));
}
