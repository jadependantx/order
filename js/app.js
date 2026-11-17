// 应用入口：三个 Tab 的渲染与所有交互的分发。

import * as store from './store.js';
import { menuView, refreshGrid } from './views/menu.js';
import { historyView } from './views/history.js';
import { adminView, dishFormHTML, blankDraft } from './views/admin.js';
import { openSheet, closeSheet, toast, esc, compressImage, copyText, download } from './ui.js';
import { pickPair, aggregateIngredients, groupByAisle } from './logic.js';
import { sendPush, orderText } from './push.js';

const ui = {
  tab: 'menu',
  q: '',
  category: 'all',
  page: 1,
  sort: 'recent',
  cart: [],
  pick: null,
  adminSeg: 'dishes',
  form: null,
  source: 'manual',
};

let lastIngredients = [];
let lastOrderText = '';
let searchTimer = null;
let busy = false;

function userMessage(err) {
  if (!err) return '出错了';
  if (err.kind === 'MISSING_SCHEMA') return '数据库还没建表，去 SQL Editor 跑一下建表脚本';
  if (err.kind === 'MISSING_BUCKET') return '缺少图片存储桶 dish-images';
  if (err.kind === 'AUTH') return 'key 不对或项目已暂停';
  return err.message || '操作失败';
}

// ---------- 渲染 ----------
function renderTabbar() {
  const tabs = [
    ['menu', '🍽', '点菜'],
    ['history', '🗓', '历史'],
    ['admin', '⚙️', '管理'],
  ];
  document.getElementById('tabbar').innerHTML = tabs
    .map(
      ([key, ico, label]) => `<button class="tab ${ui.tab === key ? 'on' : ''}"
        data-act="tab" data-tab="${key}" aria-current="${ui.tab === key ? 'page' : 'false'}">
        <span class="ico">${ico}</span>${label}</button>`,
    )
    .join('');
}

function render() {
  const view = document.getElementById('view');
  if (!view) return;
  if (ui.tab === 'menu') view.innerHTML = menuView(ui);
  else if (ui.tab === 'history') view.innerHTML = historyView();
  else view.innerHTML = adminView(ui);
  renderTabbar();
}

function rerenderSheet(html) {
  const sheet = document.querySelector('.sheet-mask .sheet');
  if (!sheet) return;
  sheet.innerHTML = `<div class="grab"></div>${html}`;
}

function renderBootError(err) {
  const view = document.getElementById('view');
  const missing = err && err.kind === 'MISSING_SCHEMA';
  const auth = err && err.kind === 'AUTH';
  const title = missing ? '还差一步：建表' : auth ? 'Key 不对' : '连不上数据库';
  const tip = missing
    ? '去 Supabase 控制台 → SQL Editor，把建表脚本整个粘贴进去运行，然后点下面的「重试」。'
    : auth
      ? '检查 js/config.js 里的 publishable key，或者项目是不是被暂停了。'
      : '检查一下网络，或稍后重试。';

  view.innerHTML = `
    <div class="hero"><div class="date">连接数据库</div><h1>${title}</h1></div>
    <div class="card-box">
      <p>${tip}</p>
      ${missing ? '<button class="btn small" data-act="copy-sql" style="margin-top:12px">复制建表 SQL</button>' : ''}
      <button class="btn primary" data-act="retry" style="margin-top:12px">重试</button>
    </div>
    <div class="card-box">
      <p style="font-size:12px;word-break:break-all">${esc((err && err.message) || '未知错误')}</p>
    </div>`;
}

// ---------- 随机配菜 ----------
function randomSheetHTML(pair, s) {
  const pick = (d, kind) => `
    <div class="pick">
      <span class="k ${kind}">${kind === 'meat' ? '荤' : '素'}</span>
      <div class="t">
        <h4>${esc(d.name)}</h4>
        <p>${d.minutes} 分钟 · 吃过 ${d.eatenCount || 0} 次</p>
      </div>
      <span class="e">${esc(d.emoji || '🍽')}</span>
    </div>`;
  return `
    <h2>今晚就吃这个？</h2>
    <p class="hint">按「${s.excludeDays} 天内不重复」配的一荤一素</p>
    <div class="pair">${pick(pair.meat, 'meat')}${pick(pair.veg, 'veg')}</div>
    <div class="row3">
      <button class="btn small" data-act="reroll">换一道</button>
      <button class="btn small" data-act="reroll-meat">只换荤</button>
      <button class="btn small" data-act="reroll-veg">只换素</button>
    </div>
    <button class="btn primary" data-act="take-pick" style="margin-top:4px">就这个</button>`;
}

function openRandom(lock = null) {
  const s = store.getSettings();
  const dishes = store.listDishes();
  const current = ui.pick;
  const exclude = [...ui.cart];
  if (!lock && current) {
    if (current.meat) exclude.push(current.meat.id);
    if (current.veg) exclude.push(current.veg.id);
  }
  const pair = pickPair(dishes, { excludeIds: exclude, excludeDays: s.excludeDays, lock, current });
  if (!pair.meat || !pair.veg) {
    toast('上架的荤菜或素菜不够，先去管理页加两道');
    return;
  }
  ui.pick = pair;
  const html = randomSheetHTML(pair, s);
  if (document.querySelector('.sheet-mask')) rerenderSheet(html);
  else openSheet(html);
}

// ---------- 提交与推送 ----------
function openSubmit() {
  const items = ui.cart.map((id) => store.getDish(id)).filter(Boolean);
  if (!items.length) {
    toast('还没选菜');
    return;
  }
  openSheet(`
    <h2>提交今晚菜单</h2>
    <p class="hint">${items.map((i) => esc(i.name)).join(' · ')}</p>
    <div class="field">
      <label>有什么想说的（可选）</label>
      <textarea id="order-note" class="textarea" placeholder="少油、多辣、不要香菜…"></textarea>
    </div>
    <button class="btn primary" data-act="submit-order">就这些</button>
    <button class="btn ghost" data-act="close-sheet" style="margin-top:8px">再看看</button>`);
}

function ingredientsBlock(ings) {
  return groupByAisle(ings)
    .map(
      ([aisle, rows]) => `
      <div style="margin-bottom:10px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:2px">${aisle}</div>
        ${rows
          .map(
            (r) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:5px 0;border-bottom:1px dashed var(--line)">
              <span>${esc(r.name)}</span>
              <span style="color:var(--muted);white-space:nowrap">${esc(r.qty)}</span>
            </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('');
}

function showSuccess(order) {
  lastIngredients = aggregateIngredients(order.items);
  lastOrderText = orderText(order);
  const names = order.items.map((i) => esc(i.name)).join(' · ');
  openSheet(`
    <h2>收到啦 🎉</h2>
    <p class="hint">${names}${order.note ? `　｜　${esc(order.note)}` : ''}</p>
    <div class="card-box" style="margin:0 0 12px">
      <h3>要买的食材</h3>
      ${ingredientsBlock(lastIngredients)}
    </div>
    <div id="push-status" class="hint">正在推送到你手机…</div>
    <button class="btn" data-act="copy-ing" style="margin-top:6px">复制食材清单</button>
    <button class="btn ghost" data-act="close-sheet" style="margin-top:8px">知道了</button>`);

  sendPush('🍽 今晚菜单', lastOrderText).then((r) => {
    const el = document.getElementById('push-status');
    if (!el) return;
    el.textContent = r.ok ? '已推送到你手机 ✓' : `没能自动推送：${r.reason}`;
    el.style.color = r.ok ? 'var(--green)' : 'var(--accent)';
  });
}

// ---------- 菜品表单 ----------
function openDishForm(id) {
  if (id) {
    const d = store.getDish(id);
    if (!d) return;
    ui.form = { ...d, ingredients: d.ingredients.map((x) => ({ ...x })) };
  } else {
    ui.form = blankDraft();
  }
  openSheet(dishFormHTML(ui.form));
}

async function saveDish() {
  const f = ui.form;
  if (!f) return;
  if (!f.name.trim()) {
    toast('先填个菜名');
    return;
  }
  if (busy) return;
  busy = true;
  try {
    const payload = {
      name: f.name.trim(),
      category: f.category,
      minutes: Number(f.minutes) || 30,
      spicy: Number(f.spicy) || 0,
      emoji: f.emoji || '🍽',
      image: f.image || null,
      ingredients: f.ingredients
        .map((x) => ({
          name: String(x.name || '').trim(),
          amount: String(x.amount || '').trim(),
          unit: String(x.unit || '').trim(),
          aisle: x.aisle || '其他',
        }))
        .filter((x) => x.name),
    };
    if (f.id) await store.updateDish(f.id, payload);
    else await store.createDish(payload);
    ui.form = null;
    closeSheet();
    render();
    toast('已保存');
  } finally {
    busy = false;
  }
}

// ---------- 动作 ----------
const actions = {
  async retry() {
    await boot();
  },

  async 'copy-sql'() {
    try {
      const res = await fetch('supabase/schema.sql');
      const sql = await res.text();
      const ok = await copyText(sql);
      toast(ok ? '建表 SQL 已复制，去 SQL Editor 粘贴运行' : '复制失败，打开 supabase/schema.sql 手动复制');
    } catch {
      toast('打开项目里的 supabase/schema.sql 手动复制');
    }
  },

  tab(el) {
    ui.tab = el.dataset.tab;
    ui.page = 1;
    window.scrollTo(0, 0);
    render();
  },

  cat(el) {
    ui.category = el.dataset.cat;
    ui.page = 1;
    render();
  },

  'page-prev'() {
    if (ui.page > 1) ui.page -= 1;
    render();
    document.getElementById('dish-grid')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },

  'page-next'() {
    ui.page += 1;
    render();
    document.getElementById('dish-grid')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },

  'toggle-dish'(el) {
    const id = el.dataset.id;
    const i = ui.cart.indexOf(id);
    if (i >= 0) ui.cart.splice(i, 1);
    else ui.cart.push(id);
    render();
  },

  'clear-cart'() {
    ui.cart = [];
    ui.source = 'manual';
    render();
  },

  'open-submit'() {
    openSubmit();
  },

  'open-random'() {
    ui.pick = null;
    openRandom();
  },

  reroll() {
    openRandom();
  },

  'reroll-meat'() {
    openRandom('veg'); // 保留素菜，只换荤
  },

  'reroll-veg'() {
    openRandom('meat'); // 保留荤菜，只换素
  },

  'take-pick'() {
    const p = ui.pick;
    if (!p) return;
    for (const d of [p.meat, p.veg]) if (d && !ui.cart.includes(d.id)) ui.cart.push(d.id);
    ui.source = 'random';
    ui.pick = null;
    closeSheet();
    render();
    openSubmit();
  },

  async 'submit-order'() {
    if (busy) return;
    busy = true;
    try {
      const note = (document.getElementById('order-note')?.value || '').trim();
      const res = await store.createOrder({ dishIds: [...ui.cart], note, source: ui.source });
      if (!res.ok) {
        toast(res.reason);
        return;
      }
      ui.cart = [];
      ui.source = 'manual';
      render();
      showSuccess(res.order);
    } finally {
      busy = false;
    }
  },

  async 'copy-ing'() {
    const text = lastIngredients.map((r) => `${r.name} ${r.qty}`.trim()).join('\n');
    const ok = await copyText(text);
    toast(ok ? '食材清单已复制' : '复制失败，手动选一下');
  },

  'close-sheet'() {
    closeSheet();
    ui.form = null;
  },

  // 管理页
  seg(el) {
    ui.adminSeg = el.dataset.seg;
    render();
  },

  'dish-new'() {
    openDishForm(null);
  },

  'dish-edit'(el) {
    openDishForm(el.dataset.id);
  },

  async 'dish-toggle'(el) {
    const d = store.getDish(el.dataset.id);
    if (!d) return;
    const next = d.status === 'active' ? 'archived' : 'active';
    await store.updateDish(d.id, { status: next });
    render();
    toast(next === 'archived' ? '已下架，点菜页看不到了' : '已上架');
  },

  async 'dish-del'(el) {
    const d = store.getDish(el.dataset.id);
    if (!d) return;
    if (!window.confirm(`删除「${d.name}」？\n历史订单里的记录会保留，不会被删。`)) return;
    await store.deleteDish(d.id);
    render();
    toast('已删除');
  },

  'pick-image'() {
    document.getElementById('dish-image')?.click();
  },

  'ing-add'() {
    ui.form.ingredients.push({ name: '', amount: '', unit: 'g', aisle: '蔬菜' });
    rerenderSheet(dishFormHTML(ui.form));
  },

  'ing-del'(el) {
    const i = Number(el.dataset.i);
    ui.form.ingredients.splice(i, 1);
    if (!ui.form.ingredients.length) ui.form.ingredients.push({ name: '', amount: '', unit: 'g', aisle: '蔬菜' });
    rerenderSheet(dishFormHTML(ui.form));
  },

  'dish-save'() {
    return saveDish();
  },

  async 'order-done'(el) {
    await store.setOrderStatus(el.dataset.id, 'done');
    render();
    toast('记上了，吃过次数 +1');
  },

  async 'order-skip'(el) {
    await store.setOrderStatus(el.dataset.id, 'skipped');
    render();
    toast('已放进改天清单');
  },

  async 'order-undo'(el) {
    await store.setOrderStatus(el.dataset.id, 'pending');
    render();
    toast('已撤销，回到待做');
  },

  reorder(el) {
    const d = store.getDish(el.dataset.id);
    if (!d) return toast('这道菜已经被删了');
    if (d.status !== 'active') return toast('这道菜已下架，先上架再点');
    if (!ui.cart.includes(d.id)) ui.cart.push(d.id);
    ui.tab = 'menu';
    ui.page = 1;
    render();
    toast('已加入今晚菜单');
  },

  'save-settings'() {
    const patch = {};
    document.querySelectorAll('[data-setting]').forEach((el) => {
      const key = el.dataset.setting;
      patch[key] = el.type === 'number' ? Number(el.value) : el.value.trim();
    });
    store.updateSettings(patch);
    render();
    toast('设置已保存');
  },

  async 'push-test'() {
    const r = await sendPush('点菜 · 测试', '如果你收到这条，推送就通了 🎉');
    toast(r.ok ? '推送成功，去看微信' : r.reason);
  },

  'export-data'() {
    const day = new Date().toISOString().slice(0, 10);
    download(`diancai-${day}.json`, store.exportJSON());
    toast('备份已导出');
  },

  async 'reset-data'() {
    if (!window.confirm('恢复成示例菜品？当前的菜品会被替换，历史订单保留。')) return;
    await store.restoreSeedDishes();
    ui.cart = [];
    render();
    toast('已恢复示例菜品');
  },
};

// ---------- 事件 ----------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(el, e);
  } catch (err) {
    console.error(err);
    toast(userMessage(err));
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') {
    ui.q = t.value;
    ui.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshGrid(ui), 120);
    return;
  }
  if (t.dataset.f && ui.form) {
    ui.form[t.dataset.f] = t.value;
    return;
  }
  if (t.dataset.ing !== undefined && ui.form) {
    const i = Number(t.dataset.ing);
    if (ui.form.ingredients[i]) ui.form.ingredients[i][t.dataset.field] = t.value;
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.act === 'sort') {
    ui.sort = t.value;
    ui.page = 1;
    render();
    return;
  }
  if (t.dataset.f && ui.form) {
    ui.form[t.dataset.f] = t.value;
    if (t.dataset.f === 'emoji') {
      const p = document.getElementById('img-preview');
      if (p && !ui.form.image) p.textContent = t.value || '🍽';
    }
    return;
  }
  if (t.dataset.ing !== undefined && ui.form) {
    const i = Number(t.dataset.ing);
    if (ui.form.ingredients[i]) ui.form.ingredients[i][t.dataset.field] = t.value;
    return;
  }

  if (t.id === 'dish-image' && t.files && t.files[0]) {
    const preview = document.getElementById('img-preview');
    try {
      toast('正在压缩上传图片…');
      const dataUrl = await compressImage(t.files[0]);
      const url = await store.uploadImage(dataUrl);
      if (!ui.form) return;
      ui.form.image = url;
      if (preview) preview.innerHTML = `<img src="${url}" alt="" />`;
      toast('图片已就绪');
    } catch (err) {
      console.error(err);
      toast('图片上传失败：' + userMessage(err));
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSheet();
    ui.form = null;
  }
});

// ---------- 启动 ----------
async function boot() {
  const view = document.getElementById('view');
  if (view) view.innerHTML = '<div class="empty"><div class="big">🍚</div>正在连接…</div>';
  try {
    await store.init();
    render();
  } catch (err) {
    console.error(err);
    renderBootError(err);
  }
}

await boot();
