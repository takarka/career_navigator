/**
 * Идемпотентность POST через заголовок Idempotency-Key (схема из черновика IETF, не финального RFC).
 * Сервер запоминает ключ вместе с «отпечатком» тела и результатом. Повтор с тем же ключом и телом возвращает сохранённый ответ
 * без повторного выполнения; тот же ключ с другим телом — 422; ключ в процессе обработки — 409.
 */
export interface Resp {
  status: number;
  body: string;
  /** Выполнено ли реальное действие (списание) этим запросом. */
  executed: boolean;
}

interface Entry {
  fingerprint: string;
  state: 'processing' | 'done';
  response?: Resp;
}

export class IdemServer {
  private store = new Map<string, Entry>();
  charges: string[] = [];

  /** Начало обработки (для сценария «повтор пришёл, пока первый запрос ещё выполняется»). */
  begin(key: string | undefined, body: string): { immediate?: Resp; finish?: () => Resp } {
    if (key !== undefined) {
      const e = this.store.get(key);
      if (e) {
        if (e.fingerprint !== body) return { immediate: { status: 422, body: 'Idempotency-Key уже использован с другим телом запроса', executed: false } };
        if (e.state === 'processing') return { immediate: { status: 409, body: 'Запрос с этим ключом ещё обрабатывается', executed: false } };
        return { immediate: { ...e.response!, executed: false } };
      }
      this.store.set(key, { fingerprint: body, state: 'processing' });
    }
    return {
      finish: () => {
        this.charges.push(body);
        const r: Resp = { status: 201, body: `платёж ${this.charges.length} создан`, executed: true };
        if (key !== undefined) this.store.set(key, { fingerprint: body, state: 'done', response: r });
        return r;
      },
    };
  }

  post(key: string | undefined, body: string): Resp {
    const b = this.begin(key, body);
    return b.immediate ?? b.finish!();
  }
}
