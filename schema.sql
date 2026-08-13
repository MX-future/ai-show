-- ============================================================
-- AI 项目作品集 · Supabase 初始化脚本
-- 在 Supabase SQL Editor 中执行一次即可
-- ============================================================

-- 1. projects 表
create table if not exists public.projects (
  id              text primary key,          -- 项目 ID（路由标识）
  name            text not null,
  type            text not null default 'web' check (type in ('web','app','mac','exe')),
  tagline         text default '',
  description     text default '',
  tech            jsonb default '[]',
  cover_from      text default '#6366f1',
  cover_to        text default '#8b5cf6',
  date            text default '',
  status          text default 'online' check (status in ('online','wip','archived')),
  url             text default '',           -- Web 外链（可选）
  allow_embed     boolean default true,      -- 是否允许 iframe 嵌入
  screenshots     jsonb default '[]',        -- [{label, image}]
  downloads       jsonb default '[]',        -- [{platform, url}]
  sort            int default 0,
  dist_base       text default '',           -- dist 站点根
  dist_uploaded_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 2. Storage 桶
-- sites 桶：存放各项目 dist 解压文件（私有，由函数代理读取）
insert into storage.buckets (id, name, public)
values ('sites', 'sites', false)
on conflict (id) do nothing;

-- images 桶：存放截图/封面（公共读）
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- images 桶公共读策略
drop policy if exists "images public read" on storage.objects;
create policy "images public read"
  on storage.objects for select
  using (bucket_id = 'images');

-- 3. RLS：projects 表公开可读；写操作由 service_role（函数）执行，无需额外策略
alter table public.projects enable row level security;

drop policy if exists "projects public read" on public.projects;
create policy "projects public read"
  on public.projects for select
  using (true);

-- 4. 管理员密码表（支持后台在线修改密码；scrypt 哈希存储）
create table if not exists public.admin_config (
  id            int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at    timestamptz default now()
);

-- 5. 建表完成后，需要给 Netlify 配置环境变量：
--    SUPABASE_URL = https://xxxx.supabase.co
--    SUPABASE_SERVICE_ROLE_KEY = <Dashboard → Settings → API → service_role key>
--    ADMIN_PASSWORD = 初始管理后台密码（首次登录后可在后台修改，存 admin_config 表）
--    TOKEN_SECRET = 任意随机长字符串（用于签名登录 token）
