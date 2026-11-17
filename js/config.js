// 连接配置。publishable key 是公开 key，放前端没问题；
// 千万不要把 secret key（sb_secret_ 开头或 service_role）写进这里。

export const CONFIG = {
  url: 'https://ykofuvfceyfvmtlxmrcm.supabase.co',
  key: 'sb_publishable_nECMnIO0rpYN5kY9G0Aw9A_5MoRWj8b',
  bucket: 'dish-images',
  // auto：有 url/key 就用 Supabase，没有就退回本地存储
  // local：强制本地（开发/演示用）
  mode: 'auto',
};
