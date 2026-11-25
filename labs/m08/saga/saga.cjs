// Лаборатория: Saga (оркестрация). Три «сервиса» живут в памяти; отказ можно внедрить на любом шаге.
// ЗАДАНИЕ: при отказе шага выполни компенсации уже выполненных шагов в обратном порядке.
// Сейчас оркестратор просто останавливается, и система остаётся в несогласованном состоянии.
// Проверка: npm test
class Services {
  constructor(failAt) {
    this.failAt = failAt; // имя шага, на котором произойдёт отказ
    this.orders = new Set();
    this.payments = new Map(); // orderId -> сумма
    this.reserved = new Set();
    this.calls = [];
  }
  call(name, fn) {
    this.calls.push(name);
    if (this.failAt === name) throw new Error(`отказ: ${name}`);
    fn();
  }
  createOrder(id) { this.call('createOrder', () => this.orders.add(id)); }
  cancelOrder(id) { this.call('cancelOrder', () => this.orders.delete(id)); }
  charge(id, sum) { this.call('charge', () => this.payments.set(id, sum)); }
  refund(id) { this.call('refund', () => this.payments.delete(id)); }
  reserve(id) { this.call('reserve', () => this.reserved.add(id)); }
  release(id) { this.call('release', () => this.reserved.delete(id)); }
}

function runOrderSaga(svc, orderId) {
  const steps = [
    { action: () => svc.createOrder(orderId), compensate: () => svc.cancelOrder(orderId) },
    { action: () => svc.charge(orderId, 100), compensate: () => svc.refund(orderId) },
    { action: () => svc.reserve(orderId), compensate: () => svc.release(orderId) },
  ];
  for (const step of steps) {
    step.action(); // ← при отказе исключение вылетает наружу, предыдущие шаги не откатываются
  }
  return 'completed';
}

module.exports = { Services, runOrderSaga };
