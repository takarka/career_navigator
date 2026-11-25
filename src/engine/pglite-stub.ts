/** Заглушка для сборки «один файл»: PGlite (около 16 МБ WASM) в неё не включается. */
export class PGlite {
  waitReady = Promise.reject(new Error('PGlite недоступен в сборке «один файл»'));
  constructor() {
    this.waitReady.catch(() => {});
  }
  async close() {}
}
