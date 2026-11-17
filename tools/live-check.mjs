// 线上自检：按 config.js 连真实 Supabase，检查读、写、删是否都通。
// 运行：node tools/live-check.mjs

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
try { globalThis.navigator = window.navigator; } catch { /* 忽略 */ }

const started = Date.now();
await import('../js/app.js');

const text = document.body.textContent.replace(/\s+/g, ' ').trim();
const cards = document.querySelectorAll('.dish').length;

console.log(`耗时：${Date.now() - started} ms`);
console.log(`首页菜品卡片：${cards} 张`);
console.log(`页面文字：${text.slice(0, 200)}`);

if (!cards) {
  if (text.includes('建表')) console.log('\n结果：能连通，但表还没建（去 SQL Editor 跑 supabase/schema.sql）');
  else console.log('\n结果：异常，需要看上面的报错');
  process.exit(1);
}

// 读写删一圈，验证适配层
const store = await import('../js/store.js');
const before = store.listDishes().length;
console.log(`\n菜单里现有 ${before} 道菜，订单 ${store.listOrders().length} 单`);

const created = await store.createDish({
  name: '连接自检菜（可删）',
  category: '素',
  minutes: 5,
  spicy: 0,
  emoji: '🧪',
  ingredients: [{ name: '测试食材', amount: '1', unit: '份', aisle: '其他' }],
});
console.log(`新增：${created.name} → id=${created.id.slice(0, 8)}`);

const updated = await store.updateDish(created.id, { name: '连接自检菜（已改名）', minutes: 8 });
console.log(`修改：${updated.name} / ${updated.minutes} 分钟`);

await store.deleteDish(created.id);
const gone = !store.listDishes().some((d) => d.id === created.id);
console.log(`删除：${gone ? '已从数据库移除' : '仍然存在，异常'}`);

const after = store.listDishes().length;
console.log(`\n结果：${gone && after === before ? '读写删全部正常 ✅' : '有异常 ❌'}`);
process.exit(gone && after === before ? 0 : 1);
