import puppeteer from 'puppeteer-core';
import { AxePuppeteer } from '@axe-core/puppeteer';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'], protocolTimeout: 30000 });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.setViewport({ width: 1280, height: 900 });
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

await page.goto(base, { waitUntil: 'networkidle0' });
check('home renders title', (await page.$eval('h1', (e) => e.textContent)).includes('Node.js Backend'));
check('15 module cards', (await page.$$('.card')).length === 15);
await page.screenshot({ path: (process.env.SHOT_DIR ?? '/tmp') + '/home.png' });

await page.goto(base + '#/lesson/m01-l02', { waitUntil: 'networkidle0' });
await sleep(500);
check('lesson title', (await page.$eval('h1', (e) => e.textContent)).includes('Event loop'));
// sim stepping
const stepText = async () => page.$eval('.sim-step b', (e) => e.textContent);
const first = await stepText();
await page.click('button[aria-label="Шаг вперёд"]');
await page.click('button[aria-label="Шаг вперёд"]');
const second = await stepText();
check('sim steps change frame', first !== second, `${first} -> ${second}`);
// go to end via range
await page.$eval('.sim .player input[type=range]', (el) => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(200);
const logItems = await page.$$eval('.sim-log li', (els) => els.map((e) => e.textContent));
check('basics scenario final log', JSON.stringify(logItems) === JSON.stringify(['script start', 'script end', 'nextTick', 'promise.then', 'setTimeout']), JSON.stringify(logItems));
// switch scenario
const pickBtns = await page.$$('.sim .sim-pick .chip-btn');
await pickBtns[4].click();
await sleep(200);
await page.$eval('.sim .player input[type=range]', (el) => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(200);
const io = await page.$$eval('.sim-log li', (els) => els.map((e) => e.textContent));
check('io scenario final log', io.join('|') === 'start|end|I/O callback|nextTick|promise|setImmediate|setTimeout', io.join('|'));
await page.screenshot({ path: (process.env.SHOT_DIR ?? '/tmp') + '/lesson-sim.png', fullPage: false });

// predict game: solve first game by clicking right chips (reveal answer then verify unlock)
const predict = await page.$('.predict');
check('predict present', !!predict);
// click "Показать ответ"
const btns = await page.$$('.predict .row button');
const labels = await Promise.all(btns.map((b) => b.evaluate((e) => e.textContent)));
check('predict has buttons', labels.includes('Проверить'), labels.join(','));
// wrong order attempt: click chips in displayed order
let chips = await page.$$('.predict .pool .chip-btn');
for (const c of chips) await c.click();
await page.evaluate(() => { [...document.querySelectorAll('.predict .row button')].find((b) => b.textContent === 'Проверить').click(); });
await sleep(150);
const badOrOk = await page.$eval('.predict', (e) => e.querySelector('.callout')?.textContent ?? '');
check('predict shows verdict', /Верно|Пока не так/.test(badOrOk), badOrOk.slice(0, 40));
// solve properly: read answer via reveal, reset, then click in order
await page.evaluate(() => { [...document.querySelectorAll('.predict .row button')].find((b) => b.textContent === 'Показать ответ').click(); });
await sleep(100);
const ans = await page.$$eval('.predict .answer-slots li', (els) => els.map((e) => e.textContent));
await page.evaluate(() => { [...document.querySelectorAll('.predict .row button')].find((b) => b.textContent === 'Сбросить').click(); });
await sleep(100);
for (const a of ans) {
  await page.evaluate((txt) => { [...document.querySelectorAll('.predict .pool .chip-btn')].find((b) => b.textContent === txt && !b.disabled).click(); }, a);
}
await page.evaluate(() => { [...document.querySelectorAll('.predict .row button')].find((b) => b.textContent === 'Проверить').click(); });
await sleep(150);
const verdict = await page.$eval('.predict', (e) => e.querySelector('.callout')?.textContent ?? '');
check('predict correct order accepted', verdict.includes('Верно'), verdict.slice(0, 30));
const solvedText = await page.$eval('.predict p.muted', (e) => e.textContent);
check('predict progress counter', solvedText.includes('Решено: 1 из 5'), solvedText.slice(0, 30));

// sandbox exercise 1.1b
const sandboxes = await page.$$('.sandbox');
check('2 sandboxes in lesson', sandboxes.length === 2, String(sandboxes.length));
const runBtn = async (i) => page.evaluate((idx) => { const b = [...document.querySelectorAll('.sandbox')][idx].querySelector('button.primary'); b.click(); }, i);
await runBtn(0);
await sleep(900);
const res1 = await page.$$eval('.sandbox', (els) => els[0].querySelector('.result pre')?.textContent);
check('sandbox runs starter code', res1 === '1\n4\n3\n2', JSON.stringify(res1));
// edit code: replace editor content
const editor = (await page.$$('.sandbox .cm-content'))[0];
await editor.click();
await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
await page.evaluate((txt) => { document.execCommand('insertText', false, txt); }, "console.log('1');\nsetTimeout(() => console.log('2'), 0);\nsetTimeout(() => console.log('3'), 0);\nconsole.log('4');\n");
await sleep(300);
await runBtn(0);
await sleep(900);
const verdict2 = await page.$$eval('.sandbox', (els) => els[0].querySelector('.result')?.textContent ?? '');
check('sandbox accepts correct solution', verdict2.includes('Верно'), verdict2.slice(-40));
await page.screenshot({ path: (process.env.SHOT_DIR ?? '/tmp') + '/lesson-tasks.png', fullPage: true });

// quiz
await page.evaluate(() => { document.querySelector('.quiz').scrollIntoView(); });
const opts = await page.$$('.quiz .quiz-q .opt');
check('quiz renders options', opts.length === 24, String(opts.length));
await page.evaluate(() => { document.querySelectorAll('.quiz-q')[0].querySelectorAll('.opt')[2].click(); });
await sleep(100);
const fb = await page.$eval('.quiz .feedback', (e) => e.textContent);
check('quiz feedback correct', fb.startsWith('Верно'), fb.slice(0, 20));

// theme and mobile
await page.click('.topbar button[aria-label="Переключить тему"]');
await sleep(150);
check('theme toggles', ['dark', 'light'].includes(await page.evaluate(() => document.documentElement.dataset.theme)));
await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.goto(base + '#/lesson/m01-l02', { waitUntil: 'networkidle0' });
await sleep(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow on mobile', overflow <= 1, `overflow=${overflow}`);
await page.screenshot({ path: (process.env.SHOT_DIR ?? '/tmp') + '/mobile.png' });

// soon lesson + module page + sandbox page
await page.goto(base + '#/lesson/m12-l04', { waitUntil: 'networkidle0' });
check('last lessons are ready (no stub)', !(await page.$eval('main', (e) => e.textContent)).includes('в разработке'));
await page.goto(base + '#/module/m08', { waitUntil: 'networkidle0' });
check('module page lists 8 lessons', (await page.$$('.lesson-list li')).length === 8);
await page.goto(base + '#/sandbox', { waitUntil: 'networkidle0' });
check('sandbox page', !!(await page.$('.sandbox')));

// --- Фаза A: оглавление, режим «Коротко», заметки, поиск, ширины, a11y
await page.setViewport({ width: 1280, height: 900 });
// смена isMobile перезагружает страницу: дожидаемся её, затем идём дальше
await sleep(800);
await page.goto(base, { waitUntil: 'networkidle0' });
await page.goto(base + '#/lesson/m01-l02', { waitUntil: 'networkidle0' });
await page.waitForSelector('.notes textarea', { timeout: 8000 });
await sleep(400);
check('toc rendered', !!(await page.$('.toc li button')));
const fullCount = (await page.$$('.lesson .md')).length;
await page.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => b.textContent === 'Коротко').click());
await sleep(150);
const shortCount = (await page.$$('.lesson .md')).length;
check('short mode hides detail blocks', shortCount < fullCount, `${fullCount} -> ${shortCount}`);
await page.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => b.textContent === 'Подробно').click());
await page.type('.notes textarea', 'моя заметка');
await sleep(100);
await page.goto(base + '#/sandbox', { waitUntil: 'networkidle0' });
await page.goto(base + '#/lesson/m01-l02', { waitUntil: 'networkidle0' });
await page.waitForSelector('.notes textarea', { timeout: 8000 });
check('note persists', (await page.$eval('.notes textarea', (e) => e.value)) === 'моя заметка');
await page.goto(base + '#/search/' + encodeURIComponent('nextTick'), { waitUntil: 'networkidle0' });
await page.waitForSelector('.hits li', { timeout: 5000 }).catch(() => {});
check('search finds lesson', (await page.$$('.hits li')).length >= 1);
await page.goto(base + '#/search/' + encodeURIComponent('zzzнетакого'), { waitUntil: 'networkidle0' });
await sleep(600);
check('search empty state', (await page.$('.hits')) === null);

// --- Фаза B: демо общих компонентов
await page.goto(base + '#/demo', { waitUntil: 'networkidle0' });
await sleep(600);
check('demo: timeline renders', !!(await page.$('.timeline svg')));
const evBefore = (await page.$$('.timeline svg rect[stroke-width]')).length;
await page.evaluate(() => document.querySelector('.timeline button[aria-label="Шаг вперёд"]').click());
await sleep(100);
check('demo: timeline step reveals events', (await page.$$('.timeline svg rect[stroke-width]')).length > evBefore);
check('demo: charts render', (await page.$$('.chart svg')).length === 2);
await page.evaluate(() => document.querySelector('.diagram g[role=button][aria-label^="PostgreSQL"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
await sleep(100);
const downs = await page.$$eval('.diagram g[role=button]', (gs) => gs.filter((g) => g.getAttribute('aria-label').includes('не работает')).length);
check('demo: failing db cascades', downs >= 3, `down nodes=${downs}`);
await page.evaluate(() => [...document.querySelectorAll('.test-exercise button')].find((b) => b.textContent.includes('Запустить тесты')).click());
await sleep(1200);
const starterRes = await page.$eval('.test-exercise .result', (e) => e.textContent).catch(() => '');
check('demo: starter code fails tests', starterRes.includes('Пройдено 0 из 3'), starterRes.slice(0, 40));

// --- Фаза C: подготовка к собеседованию
await page.goto(base + '#/practice/interview', { waitUntil: 'networkidle0' });
await sleep(500);
await page.evaluate(() => [...document.querySelectorAll('.mock button')].find((b) => b.textContent.includes('Начать интервью')).click());
await sleep(200);
check('mock: question shown without reference', !!(await page.$('.mock h3')) && !(await page.$('.mock .reference')));
await page.type('#mock-answer', 'мой ответ на вопрос');
await page.evaluate(() => [...document.querySelectorAll('.mock button')].find((b) => b.textContent.includes('Отправить и показать эталон')).click());
await sleep(200);
check('mock: reference revealed after answer', !!(await page.$('.mock .reference')));
await page.evaluate(() => document.querySelector('.mock .check-line input').click());
await sleep(100);
check('mock: self-score shown', (await page.$eval('.mock fieldset', (e) => e.textContent)).includes('из 10'));

await page.goto(base + '#/practice/flashcards', { waitUntil: 'networkidle0' });
await sleep(500);
check('flashcards: card shown', !!(await page.$('.flash .card-face h3')));
await page.evaluate(() => [...document.querySelectorAll('.flash button')].find((b) => b.textContent.includes('Показать ключевые пункты')).click());
await sleep(100);
await page.evaluate(() => [...document.querySelectorAll('.flash button')].find((b) => b.textContent === 'Знаю').click());
await sleep(150);
check('flashcards: box counters updated', (await page.$eval('.flash p.muted', (e) => e.textContent)).includes('1 ·'));

await page.goto(base + '#/practice/star', { waitUntil: 'networkidle0' });
await sleep(500);
await page.type('#star-optimization-result', 'p95 снизился с 800 до 200 мс');
await sleep(100);
check('star: result check passes with number', (await page.$$eval('.star .checks li.ok', (l) => l.length)) >= 1);

await page.goto(base + '#/lesson/m14-l03', { waitUntil: 'networkidle0' });
await sleep(600);
check('m14-l03: 4 live-coding test exercises', (await page.$$('.test-exercise')).length === 4);

// --- Фаза D: модуль 1
await page.goto(base + '#/lesson/m01-l01', { waitUntil: 'networkidle0' });
await page.waitForSelector('.tpsim svg', { timeout: 8000 });
check('m01-l01: thread pool sim renders', !!(await page.$('.tpsim svg')));
check('m01-l01: zones game has 10 rows', (await page.$$('.zones select')).length === 10);
await page.goto(base + '#/lesson/m01-l03', { waitUntil: 'networkidle0' });
await page.waitForSelector('.blockdemo', { timeout: 8000 });
const f1 = Number(await page.$eval('[data-testid=frames]', (e) => e.textContent));
await sleep(300);
const f2 = Number(await page.$eval('[data-testid=frames]', (e) => e.textContent));
check('m01-l03: frame counter ticks', f2 > f1, `${f1} -> ${f2}`);
await page.evaluate(() => [...document.querySelectorAll('.blockdemo button')].find((b) => b.textContent.includes('Web Worker')).click());
await sleep(500);
const f3 = Number(await page.$eval('[data-testid=frames]', (e) => e.textContent));
check('m01-l03: counter keeps ticking while worker computes', f3 > f2, `${f2} -> ${f3}`);
await sleep(1500);
await page.goto(base + '#/lesson/m01-l04', { waitUntil: 'networkidle0' });
await page.waitForSelector('.emsim', { timeout: 8000 });
check('m01-l04: emitter sim renders', !!(await page.$('.emsim .listeners, .emsim .empty')));
await page.goto(base + '#/lesson/m01-l05', { waitUntil: 'networkidle0' });
await page.waitForSelector('.bpsim', { timeout: 8000 });
check('m01-l05: backpressure sim renders', !!(await page.$('.bpsim .chart svg')));
await page.goto(base + '#/lesson/m01-l06', { waitUntil: 'networkidle0' });
await page.waitForSelector('.shutdown .timeline svg', { timeout: 8000 });
check('m01-l06: shutdown timeline renders', !!(await page.$('.shutdown .timeline svg')));

// --- Фаза E: модуль 8 (брокеры)
await page.goto(base + '#/lesson/m08-l02', { waitUntil: 'networkidle0' });
await page.waitForSelector('.rabbitroute', { timeout: 8000 });
await page.select('#ex-type', 'topic');
await page.select('#ex-key', 'order.eu.created');
await sleep(100);
const hits = await page.$$eval('.rabbitroute .queues li.hit', (l) => l.length);
check('m08-l02: topic routing hits eu-orders and audit', hits === 2, `hits=${hits}`);
await page.waitForSelector('.rabbitsim', { timeout: 8000 });
await page.evaluate(() => [...document.querySelectorAll('.rabbitsim button')].find((b) => b.textContent === 'Отправить сообщение').click());
await sleep(100);
check('m08-l02: rabbit sim shows a message in flight', (await page.$eval('.rabbitsim p[aria-live]', (e) => e.textContent)).includes('unacked'));
await page.goto(base + '#/lesson/m08-l03', { waitUntil: 'networkidle0' });
await page.waitForSelector('.kafkasim', { timeout: 8000 });
for (let i = 0; i < 3; i++) await page.evaluate(() => [...document.querySelectorAll('.kafkasim button')].find((b) => b.textContent === 'Отправить сообщение').click());
await sleep(100);
check('m08-l03: kafka sim logged 3 produced messages', (await page.$$eval('.kafkasim .outlog li', (l) => l.filter((x) => x.textContent.includes('продюсер')).length)) === 3);
await page.goto(base + '#/lesson/m08-l04', { waitUntil: 'networkidle0' });
await page.waitForSelector('.delivery .timeline svg', { timeout: 8000 });
check('m08-l04: delivery injector shows a verdict', (await page.$eval('.delivery p[aria-live]', (e) => e.textContent)).includes('Вердикт'));
await page.goto(base + '#/lesson/m08-l05', { waitUntil: 'networkidle0' });
await page.waitForSelector('.idem', { timeout: 8000 });
check('m08-l05: naive approach is wrong', (await page.$eval('.idem p[aria-live]', (e) => e.textContent)).includes('неверно'));
await page.goto(base + '#/lesson/m08-l06', { waitUntil: 'networkidle0' });
await page.waitForSelector('.retryplan .chart svg', { timeout: 8000 });
check('m08-l06: retry planner renders', !!(await page.$('.retryplan .chart svg')));
await page.goto(base + '#/lesson/m08-l07', { waitUntil: 'networkidle0' });
await page.waitForSelector('.outboxviz .timeline svg', { timeout: 8000 });
check('m08-l07: outbox viz renders', !!(await page.$('.outboxviz .timeline svg')));
await page.goto(base + '#/lesson/m08-l08', { waitUntil: 'networkidle0' });
await page.waitForSelector('.sagaviz .timeline svg', { timeout: 8000 });
check('m08-l08: saga viz renders', !!(await page.$('.sagaviz .timeline svg')));

// --- Фаза F: модуль 3 (PostgreSQL в браузере)
if (!process.env.BASE_URL?.startsWith('file:')) {
  await page.goto(base + '#/lesson/m03-l01', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.sqlsandbox', { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.sqlsandbox .muted')?.textContent.includes('загружаю'), { timeout: 90000 });
  await page.evaluate(() => [...document.querySelectorAll('.sqlsandbox button')].find((b) => b.textContent.includes('Выполнить')).click());
  await page.waitForSelector('.sqlsandbox .result table', { timeout: 30000 });
  const rows = await page.$$eval('.sqlsandbox .result tbody tr', (r) => r.length);
  check('m03-l01: PGlite runs starter query in browser', rows === 5, `rows=${rows}`);
  await page.goto(base + '#/lesson/m03-l06', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.sqlsandbox', { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.sqlsandbox .muted')?.textContent.includes('загружаю'), { timeout: 90000 });
  await page.evaluate(() => [...document.querySelectorAll('.sqlsandbox button')].find((b) => b.textContent.includes('EXPLAIN ANALYZE')).click());
  await page.waitForSelector('.sqlsandbox .plantree', { timeout: 30000 });
  check('m03-l06: EXPLAIN ANALYZE renders a plan tree', (await page.$$eval('.sqlsandbox .plannode', (n) => n.length)) >= 1);
  await page.goto(base + '#/lesson/m03-l02', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.btreeviz svg, .btreeviz .bnode', { timeout: 15000 });
  check('m03-l02: B-tree viz renders', (await page.$$('.btreeviz .bnode')).length >= 3);
  await page.goto(base + '#/lesson/m03-l04', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.isosim', { timeout: 15000 });
  check('m03-l04: isolation sim renders', !!(await page.$('.isosim .outlog')));
}

// --- Фаза H (часть): модуль 4 (Redis)
await page.goto(base + '#/lesson/m04-l01', { waitUntil: 'networkidle0' });
await page.waitForSelector('.redisterm', { timeout: 15000 });
for (const cmd of ['INCR visits', 'INCR visits', 'INCR visits']) {
  await page.type('#redis-input', cmd);
  await page.keyboard.press('Enter');
  await sleep(50);
}
check('m04-l01: INCR x3 completes the mission', (await page.$eval('.redisterm .callout', (e) => e.textContent)).includes('Выполнено'));
await page.goto(base + '#/lesson/m04-l04', { waitUntil: 'networkidle0' });
await page.waitForSelector('.ratesim .rl-strip', { timeout: 15000 });
const okFixed = await page.$$eval('.ratesim .rl.ok', (e) => e.length);
check('m04-l04: fixed window lets 20 through on the boundary', okFixed === 20, `ok=${okFixed}`);
await page.goto(base + '#/lesson/m04-l02', { waitUntil: 'networkidle0' });
await page.waitForSelector('.cachesim .chart svg', { timeout: 15000 });
check('m04-l02: cache sim renders chart', !!(await page.$('.cachesim .chart svg')));

for (const w of [360, 390, 768]) {
  await page.setViewport({ width: w, height: 800 });
  for (const hash of ['#/', '#/module/m01', '#/lesson/m01-l01', '#/lesson/m01-l02', '#/lesson/m01-l03', '#/lesson/m01-l04', '#/lesson/m01-l05', '#/lesson/m01-l06', '#/lesson/m08-l01', '#/lesson/m08-l02', '#/lesson/m08-l03', '#/lesson/m08-l04', '#/lesson/m08-l05', '#/lesson/m08-l06', '#/lesson/m08-l07', '#/lesson/m08-l08', '#/lesson/m03-l01', '#/lesson/m03-l02', '#/lesson/m03-l04', '#/lesson/m03-l05', '#/lesson/m03-l06', '#/lesson/m03-l07', '#/lesson/m04-l01', '#/lesson/m04-l02', '#/lesson/m04-l03', '#/lesson/m04-l04', '#/lesson/m04-l05', '#/lesson/m06-l01', '#/lesson/m06-l02', '#/lesson/m06-l03', '#/lesson/m06-l04', '#/lesson/m06-l05', '#/lesson/m05-l01', '#/lesson/m05-l02', '#/lesson/m05-l03', '#/lesson/m05-l04', '#/lesson/m05-l05', '#/lesson/m10-l01', '#/lesson/m10-l02', '#/lesson/m10-l03', '#/lesson/m10-l04', '#/lesson/m00-l01', '#/lesson/m00-l02', '#/lesson/m02-l01', '#/lesson/m02-l03', '#/lesson/m07-l01', '#/lesson/m07-l03', '#/lesson/m09-l02', '#/lesson/m09-l03', '#/lesson/m11-l01', '#/lesson/m12-l02', '#/lesson/m13-l01', '#/lesson/m12-l04', '#/lesson/m12-l05', '#/lesson/m12-l06', '#/lesson/m13-l02', '#/lesson/m14-l03', '#/lesson/m14-l04', '#/sandbox', '#/practice/interview', '#/demo']) {
    await page.goto(base + hash, { waitUntil: 'networkidle0' });
    await sleep(250);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`no overflow ${w}px ${hash}`, o <= 1, `overflow=${o}`);
  }
}

await page.setViewport({ width: 1280, height: 900 });
for (const theme of ['light', 'dark']) {
  for (const hash of ['#/', '#/module/m01', '#/lesson/m01-l02', '#/sandbox', '#/demo', '#/practice/interview', '#/practice/flashcards', '#/practice/star', '#/practice/intro', '#/lesson/m14-l01', '#/lesson/m14-l03', '#/lesson/m14-l04', '#/lesson/m01-l01', '#/lesson/m01-l03', '#/lesson/m01-l04', '#/lesson/m01-l05', '#/lesson/m01-l06', '#/lesson/m08-l01', '#/lesson/m08-l02', '#/lesson/m08-l03', '#/lesson/m08-l04', '#/lesson/m08-l05', '#/lesson/m08-l06', '#/lesson/m08-l07', '#/lesson/m08-l08', '#/lesson/m03-l01', '#/lesson/m03-l02', '#/lesson/m03-l04', '#/lesson/m03-l05', '#/lesson/m03-l06', '#/lesson/m03-l07', '#/lesson/m04-l01', '#/lesson/m04-l02', '#/lesson/m04-l03', '#/lesson/m04-l04', '#/lesson/m04-l05', '#/lesson/m06-l01', '#/lesson/m06-l02', '#/lesson/m06-l03', '#/lesson/m06-l04', '#/lesson/m06-l05', '#/lesson/m05-l01', '#/lesson/m05-l02', '#/lesson/m05-l03', '#/lesson/m05-l04', '#/lesson/m05-l05', '#/lesson/m10-l01', '#/lesson/m10-l02', '#/lesson/m10-l03', '#/lesson/m10-l04', '#/lesson/m00-l01', '#/lesson/m00-l02', '#/lesson/m02-l01', '#/lesson/m02-l03', '#/lesson/m07-l01', '#/lesson/m07-l03', '#/lesson/m09-l02', '#/lesson/m09-l03', '#/lesson/m11-l01', '#/lesson/m12-l02', '#/lesson/m13-l01', '#/lesson/m12-l04', '#/lesson/m12-l05', '#/lesson/m12-l06', '#/lesson/m13-l02']) {
    await page.goto(base + hash, { waitUntil: 'networkidle0' });
    await page.evaluate((t) => {
      const k = 'nodejs-textbook:v1';
      const st = JSON.parse(localStorage.getItem(k) ?? '{}');
      st.theme = t;
      localStorage.setItem(k, JSON.stringify(st));
    }, theme);
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(300);
    const res = await new AxePuppeteer(page).analyze();
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`axe ${theme} ${hash}`, bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target.join(' ')}`).join('; '));
  }
}

console.log(results.join('\n'));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
