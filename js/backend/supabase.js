// Supabase 后端：直接用 REST（PostgREST + Storage），不引入 SDK。
// 只依赖 publishable key，所有表都开了 RLS 且策略放开给 anon。

export class ApiError extends Error {
  constructor(status, payload, path) {
    const msg = payload?.message || payload?.error_description || `请求失败（${status}）`;
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.code;
    this.path = path;
    this.kind = '';
  }
}

const dishFromRow = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  image: row.image_url || null,
  minutes: row.cook_minutes ?? 30,
  spicy: row.spicy ?? 0,
  emoji: row.emoji || '🍽',
  ingredients: row.ingredients || [],
  status: row.status || 'active',
  createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
});

const dishToRow = (d) => ({
  name: d.name,
  category: d.category,
  image_url: d.image || null,
  cook_minutes: Number(d.minutes) || 30,
  spicy: Number(d.spicy) || 0,
  emoji: d.emoji || '🍽',
  ingredients: d.ingredients || [],
  status: d.status || 'active',
});

const orderFromRow = (row) => ({
  id: row.id,
  orderDate: row.order_date,
  items: row.items || [],
  note: row.note || '',
  source: row.source || 'manual',
  status: row.status || 'pending',
  createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
  doneAt: row.done_at ? Date.parse(row.done_at) : null,
});

const orderToRow = (o) => ({
  order_date: o.orderDate,
  items: o.items,
  note: o.note || '',
  source: o.source || 'manual',
  status: o.status || 'pending',
  done_at: o.doneAt ? new Date(o.doneAt).toISOString() : null,
});

export function createSupabaseBackend({ url, key, bucket = 'dish-images' }) {
  const base = url.replace(/\/$/, '');

  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;

    let res;
    try {
      res = await fetch(`${base}/rest/v1/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError(0, { message: '连不上 Supabase，检查一下网络' }, path);
    }

    const text = await res.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { message: text }; }
    }

    if (!res.ok) {
      const error = new ApiError(res.status, payload, path);
      const msg = payload?.message || '';
      if (res.status === 404 && (payload?.code === 'PGRST205' || /schema cache|does not exist/i.test(msg))) {
        error.kind = 'MISSING_SCHEMA';
      } else if (/Bucket not found/i.test(msg)) {
        error.kind = 'MISSING_BUCKET';
      } else if (res.status === 401 || res.status === 403) {
        error.kind = 'AUTH';
      }
      throw error;
    }
    return payload;
  }

  return {
    kind: 'supabase',

    async load() {
      const [dishRows, orderRows] = await Promise.all([
        rest('dishes?select=*&order=created_at.desc'),
        rest('orders?select=*&order=created_at.desc'),
      ]);
      return {
        dishes: (dishRows || []).map(dishFromRow),
        orders: (orderRows || []).map(orderFromRow),
      };
    },

    async insertDishes(list) {
      const rows = list.map((d) => ({ id: d.id, ...dishToRow(d) }));
      const saved = await rest('dishes', { method: 'POST', body: rows, prefer: 'return=representation' });
      return (saved || []).map(dishFromRow);
    },

    async insertDish(dish) {
      const saved = await rest('dishes', {
        method: 'POST',
        body: { id: dish.id, ...dishToRow(dish) },
        prefer: 'return=representation',
      });
      return dishFromRow(saved[0]);
    },

    async updateDish(id, patch) {
      const row = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.category !== undefined) row.category = patch.category;
      if (patch.image !== undefined) row.image_url = patch.image;
      if (patch.minutes !== undefined) row.cook_minutes = Number(patch.minutes) || 30;
      if (patch.spicy !== undefined) row.spicy = Number(patch.spicy) || 0;
      if (patch.emoji !== undefined) row.emoji = patch.emoji;
      if (patch.ingredients !== undefined) row.ingredients = patch.ingredients;
      if (patch.status !== undefined) row.status = patch.status;
      const saved = await rest(`dishes?id=eq.${id}`, {
        method: 'PATCH',
        body: row,
        prefer: 'return=representation',
      });
      return saved && saved[0] ? dishFromRow(saved[0]) : null;
    },

    async deleteDish(id) {
      await rest(`dishes?id=eq.${id}`, { method: 'DELETE' });
      return true;
    },

    async deleteAllDishes() {
      await rest('dishes?id=not.is.null', { method: 'DELETE' });
      return true;
    },

    async insertOrders(list) {
      const rows = list.map((o) => ({ id: o.id, ...orderToRow(o) }));
      const saved = await rest('orders', { method: 'POST', body: rows, prefer: 'return=representation' });
      return (saved || []).map(orderFromRow);
    },

    async insertOrder(order) {
      const saved = await rest('orders', {
        method: 'POST',
        body: { id: order.id, ...orderToRow(order) },
        prefer: 'return=representation',
      });
      return orderFromRow(saved[0]);
    },

    async updateOrder(id, patch) {
      const row = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.doneAt !== undefined) row.done_at = patch.doneAt ? new Date(patch.doneAt).toISOString() : null;
      const saved = await rest(`orders?id=eq.${id}`, {
        method: 'PATCH',
        body: row,
        prefer: 'return=representation',
      });
      return saved && saved[0] ? orderFromRow(saved[0]) : null;
    },

    async uploadImage(dataUrl) {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': blob.type || 'image/jpeg',
        },
        body: blob,
      });

      if (!res.ok) {
        let msg = `上传失败（${res.status}）`;
        try {
          const data = await res.json();
          msg = data.message || msg;
        } catch { /* 忽略 */ }
        const error = new ApiError(res.status, { message: msg }, 'storage');
        if (/Bucket not found/i.test(msg)) error.kind = 'MISSING_BUCKET';
        throw error;
      }

      return `${base}/storage/v1/object/public/${bucket}/${path}`;
    },
  };
}
