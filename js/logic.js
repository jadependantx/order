// 纯函数：搜索、排序、分页、随机配菜、食材合并、统计。不依赖 DOM，方便以后复用/测试。

import { startOfDay, DAY } from './time.js';

export { DAY };
export const PAGE_SIZE = 6;

export const AISLE_ORDER = ['蔬菜', '肉类', '水产', '蛋奶', '豆制品', '调料', '主食', '干货', '其他'];
export const SORTS = [
  { key: 'recent', label: '最近添加' },
  { key: 'oldest', label: '最久没吃' },
  { key: 'most', label: '吃得最多' },
];

export function daysSince(ts, now = Date.now()) {
  if (!ts) return null;
  return Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
}

export function relDays(ts) {
  const d = daysSince(ts);
  if (d === null) return '还没吃过';
  if (d <= 0) return '今天吃过';
  if (d === 1) return '昨天吃过';
  return `${d} 天前`;
}

export function fmtDate(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekday(ts = Date.now()) {
  return '周' + '日一二三四五六'[new Date(ts).getDay()];
}

export function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ts = new Date(y, m - 1, d).getTime();
  const diff = daysSince(ts);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  return `${m}月${d}日`;
}

export function searchDishes(dishes, { q = '', category = 'all' } = {}) {
  const kw = q.trim().toLowerCase();
  return dishes.filter((d) => {
    if (d.status !== 'active') return false;
    if (category !== 'all' && d.category !== category) return false;
    if (!kw) return true;
    if (d.name.toLowerCase().includes(kw)) return true;
    return (d.ingredients || []).some((i) => i.name.toLowerCase().includes(kw));
  });
}

export function sortDishes(list, sort) {
  const arr = [...list];
  if (sort === 'oldest') arr.sort((a, b) => (a.lastEatenAt || 0) - (b.lastEatenAt || 0));
  else if (sort === 'most') arr.sort((a, b) => (b.eatenCount || 0) - (a.eatenCount || 0));
  else arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return arr;
}

export function paginate(list, page, size = PAGE_SIZE) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: list.slice((p - 1) * size, p * size), page: p, pages, total };
}

// 加权随机：越久没吃、吃得越少，越容易被抽中。
function pickOne(dishes, { category, excludeIds = [], excludeDays = 7, now = Date.now() }) {
  const pool = dishes.filter(
    (d) => d.status === 'active' && d.category === category && !excludeIds.includes(d.id),
  );
  if (!pool.length) return null;

  const fresh = pool.filter(
    (d) => d.lastEatenAt == null || daysSince(d.lastEatenAt, now) > excludeDays,
  );
  const use = fresh.length ? fresh : pool;

  const weights = use.map((d) => {
    const days = d.lastEatenAt == null ? 30 : Math.max(daysSince(d.lastEatenAt, now), 0);
    const freshness = Math.min(days / 7, 2) + 1;
    const penalty = 1 / (1 + 0.05 * (d.eatenCount || 0));
    return freshness * penalty;
  });

  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < use.length; i++) {
    r -= weights[i];
    if (r <= 0) return use[i];
  }
  return use[use.length - 1];
}

export function pickPair(dishes, { excludeIds = [], excludeDays = 7, lock = null, current = null } = {}) {
  // lock: 'meat' 只换素、'veg' 只换荤；current 为当前已展示的一对
  const keep = (cat) => {
    if (!current) return [];
    const kept = cat === '荤' ? current.meat : current.veg;
    return kept ? [kept.id] : [];
  };

  let meat, veg;
  if (lock === 'meat' && current?.meat) {
    meat = current.meat;
    veg = pickOne(dishes, { category: '素', excludeIds: [...excludeIds, ...keep('素'), meat.id], excludeDays });
  } else if (lock === 'veg' && current?.veg) {
    veg = current.veg;
    meat = pickOne(dishes, { category: '荤', excludeIds: [...excludeIds, ...keep('荤'), veg.id], excludeDays });
  } else {
    meat = pickOne(dishes, { category: '荤', excludeIds, excludeDays });
    veg = pickOne(dishes, { category: '素', excludeIds: [...excludeIds, ...(meat ? [meat.id] : [])], excludeDays });
  }
  return { meat, veg };
}

export function aggregateIngredients(items) {
  const map = new Map();
  for (const it of items) {
    for (const ing of it.ingredients || []) {
      const unit = ing.unit || '';
      const key = `${ing.name}|${unit}`;
      const num = Number(ing.amount);
      const row = map.get(key);
      if (!row) {
        map.set(key, {
          name: ing.name,
          unit,
          aisle: ing.aisle || '其他',
          total: Number.isFinite(num) ? num : null,
          raw: String(ing.amount ?? ''),
          times: 1,
        });
      } else {
        row.times += 1;
        row.total = row.total !== null && Number.isFinite(num) ? row.total + num : null;
      }
    }
  }
  const list = [...map.values()].map((r) => ({
    ...r,
    qty: r.total !== null
      ? `${+r.total.toFixed(2)}${r.unit ? ' ' + r.unit : ''}`
      : `${r.raw}${r.times > 1 ? ` ×${r.times}` : ''}`,
  }));
  list.sort(
    (a, b) =>
      (AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle)) ||
      a.name.localeCompare(b.name, 'zh'),
  );
  return list;
}

export function groupByAisle(list) {
  const groups = new Map();
  for (const row of list) {
    if (!groups.has(row.aisle)) groups.set(row.aisle, []);
    groups.get(row.aisle).push(row);
  }
  return [...groups.entries()];
}

export function groupOrdersByDate(orders) {
  const map = new Map();
  for (const o of orders) {
    if (!map.has(o.orderDate)) map.set(o.orderDate, []);
    map.get(o.orderDate).push(o);
  }
  return [...map.entries()];
}

export function weekStats(orders, now = Date.now()) {
  const start = startOfDay(now) - (((new Date(now).getDay() + 6) % 7)) * DAY;
  const done = orders.filter((o) => o.status === 'done' && (o.doneAt || o.createdAt) >= start);
  let meat = 0;
  let veg = 0;
  const freq = new Map();
  for (const o of done) {
    for (const it of o.items) {
      if (it.category === '荤') meat += 1;
      else if (it.category === '素') veg += 1;
      freq.set(it.name, (freq.get(it.name) || 0) + 1);
    }
  }
  let top = null;
  for (const [name, count] of freq) if (!top || count > top.count) top = { name, count };
  return { meals: done.length, meat, veg, top };
}

export function skippedDishes(orders) {
  const map = new Map();
  for (const o of orders) {
    if (o.status !== 'skipped') continue;
    for (const it of o.items) {
      const prev = map.get(it.id);
      if (!prev) map.set(it.id, { id: it.id, name: it.name, category: it.category, times: 1, at: o.createdAt });
      else { prev.times += 1; prev.at = Math.max(prev.at, o.createdAt); }
    }
  }
  return [...map.values()].sort((a, b) => b.at - a.at);
}
