-- ============================================================
-- 今晚吃什么 · Supabase 初始化脚本
-- 用法：Supabase 控制台 → 左侧 SQL Editor → New query → 粘贴全部 → Run
-- 可以重复执行，不会报错、不会重复建表
-- ============================================================

-- 1. 菜品表
create table if not exists public.dishes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null check (category in ('荤', '素', '汤', '主食')),
  image_url    text,
  cook_minutes int  not null default 30,
  spicy        smallint not null default 0 check (spicy between 0 and 3),
  emoji        text default '🍽',
  ingredients  jsonb not null default '[]'::jsonb,
  status       text not null default 'active' check (status in ('active', 'archived')),
  created_at   timestamptz not null default now()
);

-- 2. 订单表（items 存下单时的菜品快照，删菜不会破坏历史）
create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  order_date date not null default current_date,
  items      jsonb not null,
  note       text,
  source     text not null default 'manual',
  status     text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  done_at    timestamptz
);

create index if not exists dishes_created_idx on public.dishes (created_at desc);
create index if not exists orders_created_idx on public.orders (created_at desc);

-- 3. 权限与行级安全（不设访问口令，按方案放开给 anon）
alter table public.dishes enable row level security;
alter table public.orders enable row level security;

grant usage on schema public to anon, authenticated;
grant all on public.dishes to anon, authenticated;
grant select, insert, update on public.orders to anon, authenticated;

drop policy if exists dishes_all on public.dishes;
create policy dishes_all on public.dishes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders
  for select to anon, authenticated using (true);

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert to anon, authenticated with check (true);

-- 订单可以改状态，但不给 delete 权限：历史不会被误删
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update to anon, authenticated using (true) with check (true);

-- 4. 菜品图片存储桶（公开读，匿名可写）
insert into storage.buckets (id, name, public)
values ('dish-images', 'dish-images', true)
on conflict (id) do update set public = true;

drop policy if exists dish_images_read on storage.objects;
create policy dish_images_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'dish-images');

drop policy if exists dish_images_write on storage.objects;
create policy dish_images_write on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'dish-images');

drop policy if exists dish_images_update on storage.objects;
create policy dish_images_update on storage.objects
  for update to anon, authenticated using (bucket_id = 'dish-images');

-- 完成。回到网页点「重试」，首次打开会自动写入 18 道示例菜。
