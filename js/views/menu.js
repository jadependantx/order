// 点菜页：搜索、分类、排序、分页（6 道/页）、已选、随机。

import { listDishes, getSettings } from '../store.js';
import {
  searchDishes, sortDishes, paginate, relDays, fmtDate, weekday, SORTS, PAGE_SIZE,
} from '../logic.js';
import { esc, gradientFor } from '../ui.js';

export function menuData(ui) {
  const found = searchDishes(listDishes(), { q: ui.q, category: ui.category });
  const sorted = sortDishes(found, ui.sort);
  const page = paginate(sorted, ui.page, PAGE_SIZE);
  ui.page = page.page;
  return page;
}

function thumb(d) {
  if (d.image) return `<img src="${d.image}" alt="${esc(d.name)}" loading="lazy" />`;
  return `<span>${esc(d.emoji || '🍽')}</span>`;
}

function card(d, picked) {
  const spicy = d.spicy ? `<span>${'🌶'.repeat(d.spicy)}</span>` : '';
  return `
    <button class="dish ${picked ? 'picked' : ''}" data-act="toggle-dish" data-id="${d.id}" aria-pressed="${picked}">
      <div class="thumb ${gradientFor(d.name)}">${thumb(d)}</div>
      <div class="body">
        <h3>${esc(d.name)}</h3>
        <div class="meta"><span>${d.minutes} 分钟</span>${spicy}</div>
        <div class="stat">吃过 <b>${d.eatenCount || 0}</b> 次 · ${relDays(d.lastEatenAt)}</div>
      </div>
      ${picked ? '<span class="badge">✓</span>' : '<span class="fab-add">＋</span>'}
    </button>`;
}

export function gridHTML(ui) {
  const page = menuData(ui);
  if (!page.total) {
    const kw = ui.q.trim();
    return `<div class="empty" style="grid-column:1/-1"><div class="big">🍳</div>${
      kw ? `没找到「${esc(kw)}」<br/>换个词，或去管理页加这道菜` : '还没有菜，去管理页加几道吧'
    }</div>`;
  }
  return page.items.map((d) => card(d, ui.cart.includes(d.id))).join('');
}

export function pagerHTML(ui) {
  const page = menuData(ui);
  return `
    <button data-act="page-prev" ${page.page <= 1 ? 'disabled' : ''} aria-label="上一页">‹</button>
    <span class="info">第 ${page.page} / ${page.pages} 页</span>
    <button data-act="page-next" ${page.page >= page.pages ? 'disabled' : ''} aria-label="下一页">›</button>`;
}

export function countHTML(ui) {
  const page = menuData(ui);
  const sortOptions = SORTS.map(
    (s) => `<option value="${s.key}" ${ui.sort === s.key ? 'selected' : ''}>${s.label}</option>`,
  ).join('');
  return `<span>共 <b>${page.total}</b> 道</span>
    <select class="sortsel" data-act="sort" aria-label="排序">${sortOptions}</select>`;
}

export function cartHTML(ui) {
  if (!ui.cart.length) return '';
  return `<div class="cartbar">
    <span class="n">已选 <b>${ui.cart.length}</b> 道</span>
    <button class="clear" data-act="clear-cart">清空</button>
    <button data-act="open-submit">提交</button>
  </div>`;
}

export function menuView(ui) {
  const cats = ['all', '荤', '素', '汤', '主食'];
  const chips = cats.map((c) => {
    const label = c === 'all' ? '全部' : c;
    return `<button class="chip ${ui.category === c ? 'on' : ''}" data-act="cat" data-cat="${c}">${label}</button>`;
  }).join('');

  return `
  <section class="hero">
    <div class="date">${fmtDate()} ${weekday()}</div>
    <h1>今天想吃什么？</h1>
    <div class="sub">挑好点提交，我就照着买菜</div>
  </section>

  <div class="search-wrap">
    <span class="ico">🔍</span>
    <input id="q" class="search" type="search" placeholder="搜菜名或食材，比如「牛腩」"
      value="${esc(ui.q)}" autocomplete="off" />
  </div>

  <div class="chips">${chips}</div>

  <div class="listbar" id="listbar">${countHTML(ui)}</div>

  <div class="grid" id="dish-grid">${gridHTML(ui)}</div>

  <div class="pager" id="pager">${pagerHTML(ui)}</div>

  <div class="actions">
    <button class="btn" data-act="open-random">🎲 不知道吃什么，帮我配一荤一素</button>
  </div>

  ${ui.cart.length ? '<div style="height:70px"></div>' : ''}
  ${cartHTML(ui)}`;
}

export function refreshGrid(ui) {
  const grid = document.getElementById('dish-grid');
  const pager = document.getElementById('pager');
  const bar = document.getElementById('listbar');
  if (grid) grid.innerHTML = gridHTML(ui);
  if (pager) pager.innerHTML = pagerHTML(ui);
  if (bar) bar.innerHTML = countHTML(ui);
}

export function refreshCart(ui) {
  document.querySelectorAll('.cartbar').forEach((el) => el.remove());
  if (!ui.cart.length) return;
  const view = document.getElementById('view');
  if (view) view.insertAdjacentHTML('beforeend', cartHTML(ui));
}

export function excludeDays() {
  return getSettings().excludeDays || 7;
}
