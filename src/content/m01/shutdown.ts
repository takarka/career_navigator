import type { TimelineSpec } from '../../engine/timeline.ts';

const lanes = [
  { id: 'k8s', title: 'Оркестратор' },
  { id: 'svc', title: 'Сервис' },
  { id: 'a', title: 'Клиент A (запрос в процессе)' },
  { id: 'b', title: 'Клиент B (новый запрос)' },
];

/** Без обработчика сигнала: процесс умирает сразу, запросы обрываются. */
export const naiveShutdown: TimelineSpec = {
  lanes,
  events: [
    { id: 'a0', lane: 'a', at: 0, label: 'GET /slow', kind: 'info', step: 0 },
    { id: 'k1', lane: 'k8s', at: 1, label: 'SIGTERM', kind: 'wait', step: 1 },
    { id: 's1', lane: 'svc', at: 2, label: 'процесс убит', kind: 'bad', step: 2 },
    { id: 'a1', lane: 'a', at: 3, label: 'ECONNRESET', kind: 'bad', step: 3 },
    { id: 'b1', lane: 'b', at: 4, label: 'отказ в соединении', kind: 'bad', step: 4 },
  ],
  arrows: [{ from: 'k1', to: 's1' }, { from: 's1', to: 'a1', label: 'обрыв' }],
  steps: [
    { title: 'Запрос в процессе', text: 'Клиент A отправил долгий запрос, сервис его обрабатывает.' },
    { title: 'SIGTERM', text: 'Оркестратор просит процесс остановиться при деплое или масштабировании.' },
    { title: 'Процесс умирает', text: 'Обработчика сигнала нет: по умолчанию Node завершается немедленно, не доделав работу.' },
    { title: 'Запрос оборван', text: 'Клиент A получает ECONNRESET: пользователь видит ошибку, а побочные эффекты могли быть выполнены наполовину.' },
    { title: 'Новые запросы', text: 'Новые соединения отклоняются, пока экземпляр не заменён: без плавного переключения это тоже ошибки.' },
  ],
};

/** С обработчиком: перестаём принимать новое, дожидаемся текущего, закрываем ресурсы, выходим с 0. */
export const gracefulShutdown: TimelineSpec = {
  lanes,
  events: [
    { id: 'a0', lane: 'a', at: 0, label: 'GET /slow', kind: 'info', step: 0 },
    { id: 'k1', lane: 'k8s', at: 1, label: 'SIGTERM', kind: 'wait', step: 1 },
    { id: 's1', lane: 'svc', at: 2, label: 'readiness: не готов', kind: 'wait', step: 2 },
    { id: 's2', lane: 'svc', at: 3, label: 'server.close()', kind: 'info', step: 3 },
    { id: 'b1', lane: 'b', at: 4, label: 'уходит на другой экземпляр', kind: 'info', step: 4 },
    { id: 's3', lane: 'svc', at: 5, label: 'ждём запрос A', kind: 'wait', step: 5 },
    { id: 'a1', lane: 'a', at: 6, label: '200 OK', kind: 'ok', step: 6 },
    { id: 's4', lane: 'svc', at: 7, label: 'закрыть БД и брокер', kind: 'ok', step: 7 },
    { id: 's5', lane: 'svc', at: 8, label: 'exit(0)', kind: 'ok', step: 8 },
  ],
  arrows: [{ from: 'k1', to: 's1' }, { from: 's3', to: 'a1', label: 'ответ' }, { from: 'a1', to: 's4' }],
  steps: [
    { title: 'Запрос в процессе', text: 'Клиент A отправил долгий запрос.' },
    { title: 'SIGTERM', text: 'Оркестратор просит остановиться и запускает таймер: по умолчанию в Kubernetes 30 секунд (terminationGracePeriodSeconds), затем SIGKILL.' },
    { title: 'Снимаем готовность', text: 'Сервис сообщает, что не готов принимать трафик, чтобы балансировщик перестал слать новые запросы.' },
    { title: 'Перестаём принимать соединения', text: 'server.close() закрывает приём новых соединений; простаивающие keep-alive закрываются через closeIdleConnections().' },
    { title: 'Новые запросы идут в другое место', text: 'Клиент B попадает на другой экземпляр и ошибки не видит.' },
    { title: 'Ждём текущие запросы', text: 'Процесс живёт, пока не завершится запрос A (но не дольше общего таймаута).' },
    { title: 'Ответ получен', text: 'Клиент A получил полный ответ 200.' },
    { title: 'Закрываем ресурсы', text: 'Закрываются потребители брокера, пул БД, кэш — в обратном порядке создания. Незавершённые подтверждения не теряются.' },
    { title: 'Выход', text: 'Процесс завершается с кодом 0. Таймер принудительного выхода (страховка) не понадобился.' },
  ],
};
