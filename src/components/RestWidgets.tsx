import { useMemo, useState } from 'preact/hooks';
import { IdemServer } from '../engine/idemkey.ts';
import { b64urlEncode, decode, signHS256, verify } from '../engine/jwt.ts';

/* ---------- Idempotency-Key ---------- */
export function IdemKeyDemo() {
  const [useKey, setUseKey] = useState(true);
  const [srv, setSrv] = useState(() => new IdemServer());
  const [log, setLog] = useState<string[]>([]);
  const [n, setN] = useState(0);
  const send = (retry: boolean) => {
    const key = useKey ? `pay-${retry ? n : n + 1}` : undefined;
    if (!retry) setN(n + 1);
    const r = srv.post(key, '{"orderId": 7, "sum": 100}');
    setLog((l) => [...l, `${retry ? 'Повтор после таймаута' : 'Новый платёж'}${key ? ` (ключ ${key})` : ' (без ключа)'} → ${r.status} ${r.body}${r.executed ? '' : ' — повторно не выполнено'}`]);
    setSrv(Object.assign(Object.create(Object.getPrototypeOf(srv)), srv));
  };
  const reset = () => { setSrv(new IdemServer()); setLog([]); setN(0); };
  return (
    <div class="idemkey">
      <div class="row wrap">
        <label><input type="checkbox" checked={useKey} onChange={() => { setUseKey(!useKey); reset(); }} /> Клиент отправляет заголовок Idempotency-Key</label>
        <button class="primary" onClick={() => send(false)}>POST /payments (новый)</button>
        <button onClick={() => send(true)} disabled={n === 0}>Клиент не получил ответ и повторяет запрос</button>
        <button onClick={reset}>Сброс</button>
      </div>
      <p aria-live="polite">Списаний на сервере: <b class={srv.charges.length > n ? 'bad-text' : 'ok-text'}>{srv.charges.length}</b>, уникальных операций клиента: <b>{n}</b>{srv.charges.length > n ? ' — дубль!' : ''}</p>
      <ol class="outlog">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
    </div>
  );
}

/* ---------- JWT ---------- */
const SECRET = 'учебный-секрет-не-используй-в-продакшене';
const NOW = 1700000100;

export function JwtPlayground() {
  const [payload, setPayload] = useState('{\n  "sub": "u1",\n  "role": "user",\n  "iss": "auth.example",\n  "aud": "api",\n  "exp": 1700003600\n}');
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState(SECRET);
  const [allowNone, setAllowNone] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [busy, setBusy] = useState(false);
  const d = useMemo(() => decode(token), [token]);

  const issue = async () => {
    try {
      setToken(await signHS256(JSON.parse(payload), SECRET));
      setVerdict('');
    } catch {
      setVerdict('Некорректный JSON в payload.');
    }
  };
  const forge = () => {
    const p = decode(token);
    if (!p) return;
    const b = b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...p.payload, role: 'admin' })));
    setToken(`${token.split('.')[0]}.${b}.${token.split('.')[2]}`);
    setVerdict('');
  };
  const algNone = () => {
    const p = decode(token);
    if (!p) return;
    const h = b64urlEncode(new TextEncoder().encode('{"alg":"none","typ":"JWT"}'));
    const b = b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...p.payload, role: 'admin' })));
    setToken(`${h}.${b}.`);
    setVerdict('');
  };
  const check = async () => {
    setBusy(true);
    const algorithms = allowNone ? ['HS256', 'none'] : ['HS256'];
    // небезопасный режим «доверять alg из токена» имитирует классическую уязвимость
    const dd = decode(token);
    if (allowNone && dd?.header.alg === 'none') {
      setVerdict(`✗ ПРИНЯТ (уязвимость!): сервер доверяет полю alg из токена и пропускает «none». Роль в токене: ${String(dd.payload.role)}.`);
    } else {
      const r = await verify(token, secret, { now: NOW, algorithms, issuer: 'auth.example', audience: 'api' });
      setVerdict(r.ok ? `✓ Принят. Роль: ${String(r.payload.role)}.` : `✗ Отклонён: ${r.reason}.`);
    }
    setBusy(false);
  };

  return (
    <div class="jwtplay">
      <label for="jwt-payload">Payload (JSON)</label>
      <textarea id="jwt-payload" rows={7} style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }} value={payload} onInput={(e) => setPayload((e.target as HTMLTextAreaElement).value)} />
      <div class="row wrap">
        <button class="primary" onClick={issue}>Выпустить токен (HS256)</button>
        <button onClick={forge} disabled={!token}>Подделать роль admin (подпись останется прежней)</button>
        <button onClick={algNone} disabled={!token}>Атака alg: none</button>
      </div>
      <label for="jwt-token">Токен</label>
      <textarea id="jwt-token" rows={4} style={{ width: '100%', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }} value={token} onInput={(e) => setToken((e.target as HTMLTextAreaElement).value)} />
      {d && (
        <div class="grid2">
          <div><div class="pane-title">Header</div><pre>{JSON.stringify(d.header, null, 2)}</pre></div>
          <div><div class="pane-title">Payload (читается без ключа!)</div><pre>{JSON.stringify(d.payload, null, 2)}</pre></div>
        </div>
      )}
      <div class="row wrap">
        <label>Ключ проверки на сервере <input value={secret} onInput={(e) => setSecret((e.target as HTMLInputElement).value)} style={{ width: '18em', maxWidth: '100%' }} /></label>
        <label><input type="checkbox" checked={allowNone} onChange={() => setAllowNone(!allowNone)} /> Небезопасный сервер: доверяет полю alg из токена</label>
        <button onClick={check} disabled={!token || busy}>Проверить на сервере</button>
      </div>
      <p aria-live="polite" class={verdict.startsWith('✓') || verdict.startsWith('✗ ПРИНЯТ') ? (verdict.startsWith('✓') ? 'ok-text' : 'bad-text') : 'bad-text'}>{verdict}</p>
      <p class="model-note">Подпись HS256 считается Web Crypto и совпадает с библиотекой jsonwebtoken (автотест). Текущее время проверки фиксировано (для воспроизводимости): токен по умолчанию действителен.</p>
    </div>
  );
}
