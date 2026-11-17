# 今晚吃什么 · 对象点菜网页

她打开就能点菜，你照着买菜；点单结果推到手机，食材自动汇总。数据存在 Supabase，两台手机看到同一份。

## 本地预览

双击 `预览.bat`，或：

```bash
npm start          # http://127.0.0.1:5173
```

> 必须通过本地服务器打开，直接双击 `index.html` 会因为模块安全策略白屏。
> 手机预览：连同一个 Wi-Fi，把地址换成电脑局域网 IP，例如 `http://192.168.1.5:5173`。

## 一次性准备工作

第一次打开如果提示「还差一步：建表」，说明数据库还没建表：

1. 打开 [supabase/schema.sql](supabase/schema.sql)，全选复制
2. Supabase 控制台 → 左侧 **SQL Editor** → New query → 粘贴 → **Run**
3. 回到网页点「重试」

跑完会自动写入 18 道示例菜和几顿历史。建表脚本可以重复执行，不会报错。

## 现在能做什么

| 页面 | 功能 |
| --- | --- |
| 点菜 | 搜索（菜名/食材）、分类、排序、每页 6 道、卡片显示「吃过 N 次 · 上次 X 天前」、点选与提交 |
| 随便 | 加权随机一荤一素，支持「换一道 / 只换荤 / 只换素」「就这个」 |
| 提交 | 备注 → 生成订单 → 食材按超市分区汇总 → 可复制 → 推送到手机 |
| 历史 | 本周顿数与荤素比、最常吃、按天分组、改天清单（可再点一次） |
| 管理 | 菜品增删改、拍照/选图（压缩后传 Storage）、上下架、订单看板、设置 |

计数规则：只有标「做好了」才算吃过；次数与「上次吃」由 `done` 订单实时算出，不落库，不会算错。

## 目录

```
对象点菜网页/
├── index.html                入口
├── css/style.css             样式（移动端优先）
├── js/
│   ├── app.js                启动、路由、事件分发
│   ├── config.js             Supabase URL / publishable key / 模式
│   ├── store.js              数据层（缓存 + 业务规则）
│   ├── backend/
│   │   ├── index.js          选择后端（Supabase 或本地）
│   │   ├── supabase.js       PostgREST + Storage，无 SDK
│   │   └── local.js          localStorage，用于离线与测试
│   ├── logic.js              搜索/分页/随机/食材合并/统计
│   ├── seed.js               18 道示例菜
│   ├── time.js               日期与 ID
│   ├── push.js               推送（PushPlus）
│   └── views/                menu / history / admin
├── supabase/schema.sql       建表 + 权限 + 存储桶
├── tools/serve.mjs           本地静态服务器
├── tools/test.mjs            jsdom 冒烟测试（34 项，强制本地后端）
├── tools/live-check.mjs      线上连通性自检
└── 预览.bat                  一键启动
```

## 测试

```bash
npm test     # 34 项，跑本地后端，不碰线上数据
npm run live # 按 config.js 连真实 Supabase，看能否渲染
```

## 数据与安全

- `config.js` 里是 **publishable key**（公开 key，设计上就可以进前端）
- **不要**把 `sb_secret_...` 或 `service_role` 放进来，那是能绕过所有权限的钥匙
- 没有访问口令（按需求）：拿到链接的人理论上能改菜单，已用「每日 5 单上限 + 删除二次确认 + 订单不可删」兜底
- 管理 → 设置 → 导出数据备份，可下载完整 JSON

## 配置推送

1. pushplus.plus 微信扫码登录，复制 token
2. 管理 → 设置 → 填 token → 保存 → 「发一条测试推送」

> 浏览器直连 PushPlus 可能被跨域拦住。拦住了也行：提交成功页有「复制食材清单」。要彻底解决就加一个 Supabase Edge Function 转发，token 也不用放前端了。

## 部署到 Vercel

纯静态站点，无需构建：

```bash
npm i -g vercel
vercel --prod
```

Framework 选 **Other**，Build Command 留空，Output Directory 填 `.`。

部署后手机打开链接 → 浏览器菜单 →「添加到主屏幕」。

## 已知限制

- 无访问口令
- 推送是浏览器直连，正式版建议走 Edge Function
- 菜品图片走 Storage；本地模式下图片是内联 dataURL
