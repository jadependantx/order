// 管理页：菜品 CRUD、订单看板、设置。

import { listDishes, listOrders, getSettings, getBackendKind, CATEGORIES, AISLES } from '../store.js';
import { relDays, AISLE_ORDER } from '../logic.js';
import { esc, gradientFor } from '../ui.js';

/** 新增菜品时的空白草稿 */
export function blankDraft() {
  return {
    name: '',
    category: '荤',
    minutes: 30,
    spicy: 0,
    emoji: '🍳',
    image: null,
    ingredients: [{ name: '', amount: '', unit: 'g', aisle: '蔬菜' }],
  };
}

function dishRow(d) {
  const status = d.status === 'archived' ? '已下架' : '';
  return `
  <div class="row ${d.status === 'archived' ? 'dim' : ''}">
    <div class="rthumb ${gradientFor(d.name)}">${d.image ? `<img src="${d.image}" alt="">` : esc(d.emoji || '🍽')}</div>
    <div class="rt">
      <h4>${esc(d.name)}</h4>
      <p>${d.category} · ${d.minutes} 分钟 · 吃过 ${d.eatenCount || 0} 次 · ${relDays(d.lastEatenAt)}${
        status ? ` · ${status}` : ''
      }</p>
    </div>
    <div class="ract">
      <button data-act="dish-edit" data-id="${d.id}" title="编辑">✎</button>
      <button data-act="dish-toggle" data-id="${d.id}" title="${d.status === 'active' ? '下架' : '上架'}">${
        d.status === 'active' ? '↓' : '↑'
      }</button>
      <button class="warn" data-act="dish-del" data-id="${d.id}" title="删除">🗑</button>
    </div>
  </div>`;
}

function dishesHTML() {
  const all = listDishes();
  const active = all.filter((d) => d.status === 'active').length;
  if (!all.length) {
    return `<div class="empty"><div class="big">🍳</div>还没有菜，点右下角加一道</div>`;
  }
  return `
    <div class="listbar"><span>在售 <b>${active}</b> 道 · 共 ${all.length} 道</span></div>
    <div class="rows">${all.map(dishRow).join('')}</div>`;
}

function orderCardAdmin(o) {
  const tags = o.items
    .map((it) => `<span class="tagitem ${it.category === '荤' ? 'meat' : 'veg'}">${esc(it.name)}</span>`)
    .join('');
  const days = Math.floor((Date.now() - o.createdAt) / 86400000);
  const late = o.status === 'pending' && days >= 2;
  const actions = o.status === 'pending'
    ? `<button class="btn small primary" data-act="order-done" data-id="${o.id}" style="color:#fff;background:var(--accent)">做好了</button>
       <button class="btn small" data-act="order-skip" data-id="${o.id}">改天</button>`
    : `<button class="btn small ghost" data-act="order-undo" data-id="${o.id}">撤销</button>`;

  return `<div class="order-card">
    <div class="items">${tags}</div>
    ${o.note ? `<div class="note">备注：${esc(o.note)}</div>` : ''}
    <div class="foot">
      <span class="badge-status ${o.status}">${o.status === 'pending' ? '待做' : o.status === 'done' ? '已做' : '改天'}</span>
      <div style="display:flex;gap:6px">${actions}</div>
    </div>
    ${late ? `<div class="note" style="color:#9a6a00">已经放了 ${days} 天，还做吗？</div>` : ''}
  </div>`;
}

function ordersHTML() {
  const orders = listOrders();
  const pending = orders.filter((o) => o.status === 'pending');
  const past = orders.filter((o) => o.status !== 'pending');

  if (!orders.length) {
    return `<div class="empty"><div class="big">📋</div>还没有订单，她点一单就会出现在这里</div>`;
  }
  return `
    ${pending.length ? `<div class="daygroup"><div class="dh"><h4>待做 ${pending.length}</h4><span>做完点「做好了」，才会记次数</span></div>
      ${pending.map(orderCardAdmin).join('')}</div>` : ''}
    <div class="daygroup"><div class="dh"><h4>做过 / 改天</h4><span>${past.length} 单</span></div>
      ${past.length ? past.map(orderCardAdmin).join('') : `<div class="empty" style="padding:24px">还没有完成的订单</div>`}
    </div>`;
}

function settingsHTML() {
  const s = getSettings();
  return `
  <div class="card-box">
    <h3>随机配菜</h3>
    <div class="field">
      <label>最近吃过的多少天内不再推荐</label>
      <input class="input" type="number" min="0" max="60" inputmode="numeric" data-setting="excludeDays" value="${s.excludeDays}" />
    </div>
    <p>超过这个天数没吃的菜，随机时更容易被抽到。</p>
  </div>

  <div class="card-box">
    <h3>推送到手机</h3>
    <div class="field">
      <label>PushPlus token</label>
      <input class="input" data-setting="pushToken" value="${esc(s.pushToken)}" placeholder="pushplus.plus 扫码登录后复制" />
    </div>
    <p>订阅「点单通知」，她提交后微信里就能收到。token 只存在本机，接后端后会移走。</p>
    <button class="btn small" data-act="push-test" style="margin-top:10px">发一条测试推送</button>
  </div>

  <div class="card-box">
    <h3>下单限制</h3>
    <div class="field">
      <label>每天最多几单</label>
      <input class="input" type="number" min="1" max="20" inputmode="numeric" data-setting="maxPerDay" value="${s.maxPerDay}" />
    </div>
    <p>防止链接被误刷，也防止一次点一桌子。</p>
  </div>

  <div class="actions" style="padding:0 20px 10px">
    <button class="btn primary" data-act="save-settings">保存设置</button>
    <button class="btn" data-act="export-data">导出数据备份</button>
    <button class="btn danger" data-act="reset-data">恢复示例数据</button>
  </div>

  <div class="card-box" style="margin-top:8px">
    <h3>当前状态</h3>
    <p>${
      getBackendKind() === 'supabase'
        ? '已连接 Supabase：她手机上点的单会实时出现在你这里。'
        : '当前是本机存储（localStorage），换设备不会同步。'
    }</p>
  </div>`;
}

export function adminView(ui) {
  const seg = (key, label) =>
    `<button class="${ui.adminSeg === key ? 'on' : ''}" data-act="seg" data-seg="${key}">${label}</button>`;
  const body =
    ui.adminSeg === 'dishes' ? dishesHTML() : ui.adminSeg === 'orders' ? ordersHTML() : settingsHTML();
  return `
    <div class="topbar"><h1>管理</h1></div>
    <div class="seg">${seg('dishes', '菜品')}${seg('orders', '订单')}${seg('settings', '设置')}</div>
    ${body}
    ${ui.adminSeg === 'dishes' ? '<button class="fab" data-act="dish-new" aria-label="新增菜品">＋</button>' : ''}`;
}

export function dishFormHTML(d) {
  const isNew = !d.id;
  const cats = CATEGORIES.map((c) => `<option ${d.category === c ? 'selected' : ''}>${c}</option>`).join('');
  const spicyOpts = [0, 1, 2, 3]
    .map((i) => `<option value="${i}" ${Number(d.spicy) === i ? 'selected' : ''}>${i ? '🌶'.repeat(i) : '不辣'}</option>`)
    .join('');
  const aisles = AISLE_ORDER.filter((a) => a !== '其他')
    .map((a) => `<option ${a === '蔬菜' ? 'selected' : ''}>${a}</option>`)
    .join('');

  const ingRows = d.ingredients
    .map((ing, i) => `
      <div class="ing-row">
        <input class="input" data-ing="${i}" data-field="name" value="${esc(ing.name)}" placeholder="食材" />
        <input class="input" data-ing="${i}" data-field="amount" value="${esc(ing.amount)}" placeholder="量" />
        <input class="input" data-ing="${i}" data-field="unit" value="${esc(ing.unit)}" placeholder="单位" />
        <select class="select" data-ing="${i}" data-field="aisle">${AISLES.map(
          (a) => `<option ${ing.aisle === a ? 'selected' : ''}>${a}</option>`,
        ).join('')}</select>
        <button class="del" data-act="ing-del" data-i="${i}" aria-label="删除这行">×</button>
      </div>`)
    .join('');

  return `
  <h2>${isNew ? '新增菜品' : '编辑菜品'}</h2>
  <p class="hint">菜名和食材填好，做菜前照着买</p>

  <div class="field">
    <label>菜名</label>
    <input class="input" data-f="name" value="${esc(d.name)}" placeholder="比如 番茄牛腩" />
  </div>

  <div class="three">
    <div class="field">
      <label>类别</label>
      <select class="select" data-f="category">${cats}</select>
    </div>
    <div class="field">
      <label>耗时(分)</label>
      <input class="input" type="number" min="1" max="300" inputmode="numeric" data-f="minutes" value="${d.minutes}" />
    </div>
    <div class="field">
      <label>辣度</label>
      <select class="select" data-f="spicy">${spicyOpts}</select>
    </div>
  </div>

  <div class="field">
    <label>图片</label>
    <div class="imgpick">
      <div class="preview" id="img-preview">${d.image ? `<img src="${d.image}" alt="" />` : esc(d.emoji || '🍽')}</div>
      <div>
        <button class="btn small" data-act="pick-image">选图 / 拍照</button>
        <div class="tips">自动压到长边 1000px，省空间</div>
      </div>
      <input id="dish-image" type="file" accept="image/*" capture="environment" hidden />
    </div>
  </div>

  <div class="field">
    <label>没图时显示的表情</label>
    <input class="input" data-f="emoji" maxlength="4" value="${esc(d.emoji || '')}" placeholder="🍳" />
  </div>

  <div class="field">
    <label>食材清单</label>
    ${ingRows}
    <button class="btn small" data-act="ing-add">＋ 加一行</button>
  </div>

  <button class="btn primary" data-act="dish-save">${isNew ? '添加菜品' : '保存修改'}</button>
  <button class="btn ghost" data-act="close-sheet" style="margin-top:8px">取消</button>`;
}

export const AISLE_SELECT = AISLES;
export { AISLE_ORDER };
