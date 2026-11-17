// 数据层：缓存一份菜单和订单，读写走后端（Supabase 或本地）。
// 吃过次数/上次吃的时间不落库，由 done 订单实时算出来，永远不会有对不上的时候。

import { getBackend } from './backend/index.js';
import { dishSeedRows, SEED_ORDERS } from './seed.js';
import { DAY, startOfDay, orderDateStr, newId } from './time.js';

const SETTINGS_KEY = 'diancai.settings.v1';
const SEEDED_KEY = 'diancai.seeded.v1';
const DEFAULT_SETTINGS = { excludeDays: 7, pushChannel: 'pushplus', pushToken: '', maxPerDay: 5 };

export const CATEGORIES = ['荤', '素', '汤', '主食'];
export const AISLES = ['蔬菜', '肉类', '水产', '蛋奶', '豆制品', '调料', '主食', '干货'];

let backend = null;
let dishes = [];
let orders = [];
let settings = readSettings();

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 忽略 */ }
}

function recompute() {
  const count = new Map();
  const last = new Map();
  for (const o of orders) {
    if (o.status !== 'done') continue;
    const ts = o.doneAt || o.createdAt;
    for (const it of o.items) {
      count.set(it.id, (count.get(it.id) || 0) + 1);
      last.set(it.id, Math.max(last.get(it.id) || 0, ts));
    }
  }
  for (const d of dishes) {
    d.eatenCount = count.get(d.id) || 0;
    d.lastEatenAt = last.get(d.id) || null;
  }
}

async function writeSeed() {
  const rows = dishSeedRows().map((d) => ({ ...d, id: newId() }));
  const inserted = await backend.insertDishes(rows);
  dishes = inserted;
  const byName = new Map(inserted.map((d) => [d.name, d]));

  const seedOrders = SEED_ORDERS.map(({ daysAgo, names, note, status }) => {
    const created = startOfDay(Date.now() - daysAgo * DAY) + 18 * 3600e3;
    const items = names
      .map((n) => byName.get(n))
      .filter(Boolean)
      .map((d) => ({ id: d.id, name: d.name, category: d.category, minutes: d.minutes }));
    return {
      id: newId(),
      orderDate: orderDateStr(created),
      items,
      note,
      source: 'manual',
      status,
      createdAt: created,
      doneAt: status === 'done' ? created + 3600e3 : null,
    };
  }).filter((o) => o.items.length);

  orders = seedOrders.length ? await backend.insertOrders(seedOrders) : [];
  try { localStorage.setItem(SEEDED_KEY, '1'); } catch { /* 忽略 */ }
}

export async function init() {
  backend = getBackend();
  const data = await backend.load();
  dishes = data.dishes || [];
  orders = data.orders || [];

  let seeded = false;
  try { seeded = !!localStorage.getItem(SEEDED_KEY); } catch { /* 忽略 */ }
  if (!dishes.length && !seeded) await writeSeed();

  recompute();
  return { dishes: dishes.length, orders: orders.length };
}

export function getBackendKind() {
  return backend ? backend.kind : 'unknown';
}

// ---------- 读 ----------
export function listDishes() { return dishes; }

export function getDish(id) { return dishes.find((d) => d.id === id); }

export function listOrders() { return [...orders].sort((a, b) => b.createdAt - a.createdAt); }

export function ordersToday() {
  const today = orderDateStr();
  return orders.filter((o) => o.orderDate === today);
}

// ---------- 写 ----------
export async function createDish(patch) {
  const dish = {
    id: newId(),
    name: (patch.name || '').trim() || '未命名',
    category: patch.category || '荤',
    image: patch.image || null,
    minutes: Number(patch.minutes) || 30,
    spicy: Number(patch.spicy) || 0,
    emoji: patch.emoji || '🍽',
    ingredients: patch.ingredients || [],
    status: 'active',
  };
  const saved = await backend.insertDish(dish);
  dishes = [saved, ...dishes];
  recompute();
  return saved;
}

export async function updateDish(id, patch) {
  const saved = await backend.updateDish(id, patch);
  const i = dishes.findIndex((d) => d.id === id);
  if (i >= 0) dishes[i] = saved || { ...dishes[i], ...patch };
  recompute();
  return dishes[i];
}

export async function deleteDish(id) {
  await backend.deleteDish(id);
  dishes = dishes.filter((d) => d.id !== id);
  recompute();
}

export async function createOrder({ dishIds, note = '', source = 'manual' }) {
  const max = settings.maxPerDay || 5;
  if (ordersToday().length >= max) {
    return { ok: false, reason: `今天已经有 ${max} 个订单了，明天再点吧` };
  }
  const items = dishIds
    .map((id) => getDish(id))
    .filter(Boolean)
    .map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      minutes: d.minutes,
      ingredients: d.ingredients,
    }));
  if (!items.length) return { ok: false, reason: '还没选菜呢' };

  const order = {
    id: newId(),
    orderDate: orderDateStr(),
    items,
    note,
    source,
    status: 'pending',
    createdAt: Date.now(),
    doneAt: null,
  };
  const saved = await backend.insertOrder(order);
  orders = [saved, ...orders];
  recompute();
  return { ok: true, order: saved };
}

export async function setOrderStatus(id, status) {
  const patch = { status, doneAt: status === 'done' ? Date.now() : null };
  const saved = await backend.updateOrder(id, patch);
  const i = orders.findIndex((o) => o.id === id);
  if (i >= 0) orders[i] = saved || { ...orders[i], ...patch };
  recompute();
  return orders[i];
}

export async function uploadImage(dataUrl) {
  return backend.uploadImage(dataUrl);
}

// ---------- 设置 ----------
export function getSettings() { return settings; }

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  persistSettings();
  return settings;
}

// ---------- 维护 ----------
export function exportJSON() {
  return JSON.stringify({ settings, dishes, orders }, null, 2);
}

export async function restoreSeedDishes() {
  await backend.deleteAllDishes();
  dishes = [];
  try { localStorage.removeItem(SEEDED_KEY); } catch { /* 忽略 */ }
  await writeSeed();
  recompute();
}
