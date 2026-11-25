export type Zone = 'main' | 'pool' | 'os';

export const zoneLabel: Record<Zone, string> = {
  main: 'Главный поток (JS, таймеры)',
  pool: 'Thread pool libuv',
  os: 'Асинхронный ввод-вывод ОС (epoll, kqueue, IOCP)',
};

export interface ZoneItem {
  id: string;
  label: string;
  zone: Zone;
  why: string;
  /** Имя замера в labs/m01/threadpool/zones.cjs; такие элементы сверяются с реальным Node автотестом. */
  probe?: string;
}

export const zoneItems: ZoneItem[] = [
  { id: 'readfile', label: 'fs.readFile / fs.stat (асинхронные)', zone: 'pool', probe: 'fs.stat', why: 'Файловые операции в libuv выполняются в пуле потоков: у ОС нет единого переносимого неблокирующего API для файлов.' },
  { id: 'pbkdf2', label: 'crypto.pbkdf2 / scrypt (асинхронные)', zone: 'pool', probe: 'crypto.pbkdf2', why: 'Тяжёлая криптография отдаётся в пул, чтобы не блокировать главный поток.' },
  { id: 'randombytes', label: 'crypto.randomBytes(n, cb)', zone: 'pool', probe: 'crypto.randomBytes', why: 'Асинхронный вариант выполняется в пуле (синхронный блокирует главный поток).' },
  { id: 'zlib', label: 'zlib.gzip(buf, cb)', zone: 'pool', probe: 'zlib.gzip', why: 'Сжатие асинхронными методами zlib выполняется в пуле.' },
  { id: 'dnslookup', label: 'dns.lookup (его использует http.get по имени хоста)', zone: 'pool', probe: 'dns.lookup', why: 'Использует системный getaddrinfo, который блокирует, поэтому идёт в пул. dns.resolve работает иначе: через сетевые запросы к DNS-серверу.' },
  { id: 'socket', label: 'Чтение и запись TCP-сокета (по IP-адресу)', zone: 'os', probe: 'net.socket (по IP)', why: 'Сеть использует неблокирующие сокеты и опрос событий ОС, пул не нужен. Но подключение по имени хоста сначала вызывает dns.lookup в пуле.' },
  { id: 'jsonparse', label: 'JSON.parse большого документа', zone: 'main', why: 'Обычная синхронная работа JavaScript в главном потоке: пока она идёт, цикл событий стоит.' },
  { id: 'timeout', label: 'setTimeout / setImmediate', zone: 'main', probe: 'setTimeout', why: 'Таймеры хранятся и выполняются в главном потоке libuv, колбэк тоже в главном потоке.' },
  { id: 'readfilesync', label: 'fs.readFileSync', zone: 'main', why: 'Синхронный вызов блокирует главный поток на время операции.' },
  { id: 'hash', label: 'crypto.createHash(...).update(...).digest() (синхронно)', zone: 'main', why: 'Синхронное хеширование выполняется прямо в главном потоке.' },
];
