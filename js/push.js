// 推送适配层：现在直连 PushPlus；接 Supabase 后改成一个 Edge Function 的 fetch 即可。
import { getSettings } from './store.js';

export function orderText(order) {
  const lines = [];
  lines.push(`🍽 今晚菜单 · ${order.orderDate}`);
  for (const it of order.items) {
    const tag = it.category === '荤' ? '荤' : it.category === '素' ? '素' : it.category;
    lines.push(`${tag}：${it.name}`);
  }
  if (order.note) lines.push(`备注：${order.note}`);
  const ings = new Set();
  for (const it of order.items) for (const g of it.ingredients || []) ings.add(g.name);
  if (ings.size) lines.push(`食材：${[...ings].join('、')}`);
  return lines.join('\n');
}

export async function sendPush(title, content) {
  const s = getSettings();
  if (!s.pushToken) {
    return { ok: false, reason: '还没填 PushPlus token（管理 → 设置）' };
  }
  try {
    const res = await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: s.pushToken,
        title,
        content: content.replace(/\n/g, '<br/>'),
        template: 'html',
      }),
    });
    const data = await res.json();
    if (data && data.code === 200) return { ok: true };
    return { ok: false, reason: (data && data.msg) || '推送服务返回异常' };
  } catch (err) {
    return { ok: false, reason: '推送没发出去（网络或跨域限制），可用「复制」手动发' };
  }
}
