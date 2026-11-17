// 本地后端：把数据存在浏览器 localStorage，供离线预览和自动化测试使用。
// 与 Supabase 后端实现同一组方法，store 不关心下面用的是哪个。

const KEY = 'diancai.local.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { dishes: [], orders: [] };
    const parsed = JSON.parse(raw);
    return { dishes: parsed.dishes || [], orders: parsed.orders || [] };
  } catch {
    return { dishes: [], orders: [] };
  }
}

export function createLocalBackend() {
  let state = read();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  return {
    kind: 'local',

    async load() {
      return { dishes: [...state.dishes], orders: [...state.orders] };
    },

    async insertDishes(list) {
      state.dishes = [...list, ...state.dishes];
      save();
      return list;
    },

    async insertDish(dish) {
      state.dishes = [dish, ...state.dishes];
      save();
      return dish;
    },

    async updateDish(id, patch) {
      const d = state.dishes.find((x) => x.id === id);
      if (!d) return null;
      Object.assign(d, patch);
      save();
      return { ...d };
    },

    async deleteDish(id) {
      state.dishes = state.dishes.filter((x) => x.id !== id);
      save();
      return true;
    },

    async deleteAllDishes() {
      state.dishes = [];
      save();
      return true;
    },

    async insertOrders(list) {
      state.orders = [...list, ...state.orders];
      save();
      return list;
    },

    async insertOrder(order) {
      state.orders = [order, ...state.orders];
      save();
      return order;
    },

    async updateOrder(id, patch) {
      const o = state.orders.find((x) => x.id === id);
      if (!o) return null;
      Object.assign(o, patch);
      save();
      return { ...o };
    },

    async uploadImage(dataUrl) {
      // 本地模式没有存储桶，直接内联成 dataURL
      return dataUrl;
    },
  };
}
