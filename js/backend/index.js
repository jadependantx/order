// 后端选择：优先 Supabase，没有配置或强制本地时退回 localStorage。

import { CONFIG } from '../config.js';
import { createLocalBackend } from './local.js';
import { createSupabaseBackend } from './supabase.js';

export function getBackend() {
  let forced = null;
  try { forced = localStorage.getItem('diancai.mode'); } catch { /* 忽略 */ }
  const mode = forced || CONFIG.mode || 'auto';

  if (mode === 'local') return createLocalBackend();
  if (CONFIG.url && CONFIG.key) return createSupabaseBackend(CONFIG);
  return createLocalBackend();
}
