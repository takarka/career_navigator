// Решение: оркестратор хранит выполненные шаги и при отказе откатывает их в обратном порядке.
// Компенсации должны быть идемпотентными: их можно безопасно повторить.
class Services {
  constructor(failAt) {
    this.failAt = failAt;
    this.orders = new Set();
    this.payments = new Map();
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
  const done = [];
  try {
    for (const step of steps) {
      step.action();
      done.push(step);
    }
    return 'completed';
  } catch (err) {
    for (const step of done.reverse()) step.compensate(); // обратный порядок
    return 'compensated';
  }
}

module.exports = { Services, runOrderSaga };
