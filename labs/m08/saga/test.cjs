// Автотест: для отказа на каждом шаге состояние сервисов после саги должно быть согласованным.
// Запуск: npm test            (проверяет saga.cjs)
//         npm test -- solution (проверяет эталон)
const path = require('node:path');
const { Services, runOrderSaga } = require(process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'saga.cjs') : path.join(__dirname, 'saga.cjs'));

const scenarios = [
  { failAt: undefined, expect: 'completed', state: { orders: 1, payments: 1, reserved: 1 } },
  { failAt: 'createOrder', expect: 'compensated', state: { orders: 0, payments: 0, reserved: 0 } },
  { failAt: 'charge', expect: 'compensated', state: { orders: 0, payments: 0, reserved: 0 } },
  { failAt: 'reserve', expect: 'compensated', state: { orders: 0, payments: 0, reserved: 0 } },
];

let failed = 0;
for (const sc of scenarios) {
  const svc = new Services(sc.failAt);
  let result;
  try {
    result = runOrderSaga(svc, 'o1');
  } catch (e) {
    result = `исключение: ${e.message}`;
  }
  const state = { orders: svc.orders.size, payments: svc.payments.size, reserved: svc.reserved.size };
  const ok = result === sc.expect && JSON.stringify(state) === JSON.stringify(sc.state);
  // порядок компенсаций: обратный порядку выполненных шагов
  let orderOk = true;
  if (sc.failAt === 'reserve') orderOk = svc.calls.join(',') === 'createOrder,charge,reserve,refund,cancelOrder';
  if (!ok || !orderOk) failed++;
  console.log(`${ok && orderOk ? 'OK    ' : 'ПРОВАЛ'} отказ на «${sc.failAt ?? 'нет'}»: результат=${result}, состояние=${JSON.stringify(state)}${orderOk ? '' : ', неверный порядок компенсаций: ' + svc.calls.join(',')}`);
}
if (failed) {
  console.log(`ПРОВАЛ: сценариев с несогласованным состоянием: ${failed}`);
  process.exit(1);
}
console.log('OK');
