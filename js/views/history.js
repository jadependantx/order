// 历史页：本周统计、按天分组、改天清单。

import { listOrders, getDish } from '../store.js';
import { weekStats, groupOrdersByDate, dayLabel, skippedDishes, fmtDate } from '../logic.js';
import { esc } from '../ui.js';

const STATUS = { pending: '待做', done: '已做', skipped: '改天' };

function statLine(st) {
  const ratio = st.meat + st.veg > 0 ? `荤:素 = ${st.meat}:${st.veg}` : '本周还没开火';
  const top = st.top ? `最常吃：${esc(st.top.name)}` : '还没有重复的菜';
  return `<div class="line"><span>${ratio}</span><span>${top}</span></div>`;
}

function orderCard(o) {
  const tags = o.items
    .map((it) => `<span class="tagitem ${it.category === '荤' ? 'meat' : 'veg'}">${esc(it.name)}</span>`)
    .join('');
  const time = new Date(o.createdAt).toTimeString().slice(0, 5);
  return `<div class="order-card">
    <div class="items">${tags}</div>
    ${o.note ? `<div class="note">备注：${esc(o.note)}</div>` : ''}
    <div class="foot">
      <span class="badge-status ${o.status}">${STATUS[o.status] || o.status}</span>
      <span style="font-size:11.5px;color:var(--muted)">${time} 提交${o.source === 'random' ? ' · 🎲 随机' : ''}</span>
    </div>
  </div>`;
}

export function historyView() {
  const orders = listOrders();
  const st = weekStats(orders);
  const groups = groupOrdersByDate(orders);
  const skipped = skippedDishes(orders).filter((s) => getDish(s.id));

  const skippedHTML = skipped.length
    ? `<div class="daygroup">
        <div class="dh"><h4>📌 改天清单</h4><span>点了没做的，随时再点</span></div>
        ${skipped.map((s) => `
          <div class="row">
            <div class="rthumb">${esc(getDish(s.id).emoji || '🍽')}</div>
            <div class="rt"><h4>${esc(s.name)}</h4><p>${s.times > 1 ? `被改天 ${s.times} 次` : '上次说改天'}</p></div>
            <div class="ract"><button data-act="reorder" data-id="${s.id}" title="再点一次">＋</button></div>
          </div>`).join('')}
      </div>`
    : '';

  const groupsHTML = groups.length
    ? groups.map(([date, list]) => {
        const done = list.filter((o) => o.status === 'done').length;
        return `<div class="daygroup">
          <div class="dh"><h4>${dayLabel(date)}</h4><span>${date.slice(5).replace('-', '/')} · ${done} 顿</span></div>
          ${list.map(orderCard).join('')}
        </div>`;
      }).join('')
    : `<div class="empty"><div class="big">🗓</div>还没有点过菜，去点一单吧</div>`;

  return `
    <div class="topbar"><h1>吃过什么</h1></div>
    <div class="stats">
      <div class="big">${st.meals}<small>顿 · 本周</small></div>
      ${statLine(st)}
    </div>
    ${skippedHTML}
    ${groupsHTML}`;
}
