// 无浏览器冒烟测试：用 jsdom 跑真实 DOM，把点菜、提交、历史、管理走一遍。
// 运行：npm test（需要 D:\ai_work\.tools 里的 jsdom）

import { createRequire } from 'node:module';

const requireTool = createRequire('D:/ai_work/.tools/package.json');
const { JSDOM } = requireTool('jsdom');

const dom = new JSDOM(
  `<!doctype html><html><body>
    <div class="app"><main id="view"></main><nav id="tabbar"></nav></div>
    <div id="sheet-root"></div><div id="toast-root"></div>
  </body></html>`,
  { url: 'http://localhost/', pretendToBeVisual: true },
);

const { window } = dom;
window.Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
window.confirm = () => true;

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Event = window.Event;
try { globalThis.navigator = window.navigator; } catch { /* Node 自带 navigator，忽略 */ }

// 测试强制走本地后端，不碰线上数据库
window.localStorage.clear();
window.localStorage.setItem('diancai.mode', 'local');

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const text = () => document.body.textContent.replace(/\s+/g, ' ');
const input = (el, value) => {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- 启动 ----------
await import('../js/app.js');
await wait(10);

check('首页渲染出标题', text().includes('今天想吃什么'));
check('首屏 6 道菜（每页 6 道）', $$('.dish').length === 6, `实际 ${$$('.dish').length}`);
check('分页显示 3 页', text().includes('第 1 / 3 页'), text().slice(0, 80));
check('卡片显示吃过次数与上次时间', /吃过 \d+ 次 · (今天|昨天|\d+ 天前|还没吃过)/.test(text()));

// ---------- 翻页 ----------
$('[data-act="page-next"]').click();
check('翻到第 2 页', text().includes('第 2 / 3 页'));
$('[data-act="page-prev"]').click();

// ---------- 搜索 ----------
const q = $('#q');
input(q, '牛腩');
await wait(200);
check('搜「牛腩」只剩 1 道', $$('.dish').length === 1, `实际 ${$$('.dish').length}`);
check('搜到的是番茄牛腩', text().includes('番茄牛腩'));
input(q, '');
await wait(200);
check('清空搜索恢复 6 道', $$('.dish').length === 6);

// ---------- 点菜 ----------
const firstDish = $('.dish');
const dishName = firstDish.querySelector('h3').textContent;
firstDish.click();
check('选中后出现已选条', !!$('.cartbar') && text().includes('已选 1 道'));
check('选中卡片有标记', !!$('.dish.picked'));

// ---------- 提交 ----------
$('[data-act="open-submit"]').click();
check('提交弹层打开', !!$('#order-note'));
input($('#order-note'), '少放点盐');
$('[data-act="submit-order"]').click();
await wait(30);
check('提交后显示成功弹层', text().includes('收到啦'));
check('成功弹层里有食材清单', text().includes('要买的食材'));
check('提交后清空已选', !$('.cartbar'));

// ---------- 历史 ----------
$('[data-act="tab"][data-tab="history"]').click();
check('历史页有本周统计', text().includes('顿 · 本周'));
check('历史页能看到刚点的菜', text().includes(dishName));
check('历史页有待做状态', text().includes('待做'));
check('历史页有改天清单', text().includes('改天清单'));

// ---------- 管理：订单标已做 ----------
$('[data-act="tab"][data-tab="admin"]').click();
check('管理页默认是菜品', text().includes('在售'));
$('[data-act="seg"][data-seg="orders"]').click();
check('订单页出现「做好了」按钮', !!$('[data-act="order-done"]'));
$('[data-act="order-done"]').click();
await wait(30);
check('标已做后出现撤销按钮', !!$('[data-act="order-undo"]'));
check('标已做后有提示', text().includes('次数 +1'));
check('待做订单已清空', !text().includes('待做 1'));

// ---------- 管理：新增与删除菜品 ----------
$('[data-act="seg"][data-seg="dishes"]').click();
$('[data-act="dish-new"]').click();
check('新增弹层打开', !!$('[data-f="name"]'));
input($('[data-f="name"]'), '测试菜');
input($('[data-f="minutes"]'), '20');
$('[data-act="dish-save"]').click();
await wait(10);
check('新菜出现在列表', text().includes('测试菜'));

const rows = $$('.row');
const target = rows.find((r) => r.textContent.includes('测试菜'));
target.querySelector('[data-act="dish-del"]').click();
await wait(10);
check('删除后列表不再有测试菜', !text().includes('测试菜'));

// ---------- 管理：加食材行 ----------
$('[data-act="dish-new"]').click();
const before = $$('.ing-row').length;
$('[data-act="ing-add"]').click();
check('可以增加食材行', $$('.ing-row').length === before + 1);
$('[data-act="close-sheet"]').click();

// ---------- 随机配菜 ----------
$('[data-act="tab"][data-tab="menu"]').click();
$('[data-act="open-random"]').click();
check('随便弹层有荤有素', text().includes('荤') && text().includes('素') && $$('.pick').length === 2);
const pairBefore = $$('.pick h4').map((h) => h.textContent).join('|');
$('[data-act="reroll"]').click();
const pairAfter = $$('.pick h4').map((h) => h.textContent).join('|');
check('换一道后组合变化', pairBefore !== pairAfter, `${pairBefore} → ${pairAfter}`);

// 只换荤：素菜应保持不变
const [meat0, veg0] = $$('.pick h4').map((h) => h.textContent);
$('[data-act="reroll-meat"]').click();
const [meat1, veg1] = $$('.pick h4').map((h) => h.textContent);
check('只换荤时素菜不变', veg0 === veg1, `${veg0} → ${veg1}`);

$('[data-act="take-pick"]').click();
check('就这个之后进入提交', !!$('#order-note'));
$('[data-act="close-sheet"]').click();

// ---------- 纯逻辑 ----------
const { aggregateIngredients, pickPair } = await import('../js/logic.js');
const { listDishes } = await import('../js/store.js');

const ings = aggregateIngredients([
  { ingredients: [{ name: '番茄', amount: '3', unit: '个', aisle: '蔬菜' }] },
  { ingredients: [{ name: '番茄', amount: '2', unit: '个', aisle: '蔬菜' }] },
]);
const tomato = ings.find((i) => i.name === '番茄');
check('同名同单位食材合并相加', tomato && tomato.qty === '5 个', JSON.stringify(ings));

const dishes = listDishes();
let bad = 0;
for (let i = 0; i < 100; i++) {
  const p = pickPair(dishes, { excludeDays: 7 });
  if (!p.meat || !p.veg || p.meat.category !== '荤' || p.veg.category !== '素') bad += 1;
}
check('100 次随机都是一荤一素', bad === 0, `异常 ${bad} 次`);

const excluded = dishes[0].id;
let leaked = 0;
for (let i = 0; i < 50; i++) {
  const p = pickPair(dishes, { excludeDays: 7, excludeIds: [excluded] });
  if (p.meat?.id === excluded || p.veg?.id === excluded) leaked += 1;
}
check('排除的菜不会被抽到', leaked === 0);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
