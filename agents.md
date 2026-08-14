# agents.md — AI 作品集站点（AI-SHOW）

> 面向新接手的开发者 / AI 代理的快速上手文档。读完本文即可理解项目全貌、本地运行、部署方式与常见坑。

---

## 1. 项目是什么

一个 **AI 项目作品集网站**，含前台展示页 + 管理后台：

- **前台**（`/`）：项目卡片网格（按类型筛选）、项目详情页（实时预览/截图/下载）、日期时间、统计条
- **后台**（`/admin.html`）：管理员登录、项目 CRUD、截图拖拽上传、封面图、dist 包上传、GitHub Releases 下载导入
- **数据**：Supabase（Postgres + Storage），本地开发可回退到文件系统
- **部署**：Netlify（静态站点 + Functions + 环境变量）

线上地址：`https://projects-show.netlify.app/`（GitHub 仓库：`MX-future/ai-show`）

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | **Vite 7 + 原生 JS**（无框架，手写 hash 路由）、原生 CSS（玻璃拟态风格）|
| 后端 | Netlify Functions（ESM + Node 22）、统一 API 入口内部路由 |
| 数据库 | Supabase Postgres（`projects` / `admin_config` 表）|
| 存储 | Supabase Storage（`sites/` dist 文件、`images/` 图片）|
| 依赖 | `@supabase/supabase-js`、`adm-zip`（dist 解压）|
| 测试 | `node:test` + puppeteer-core（E2E）|

> 注意：`package.json` 中残留 `react`/`framer-motion` 依赖（历史遗留，**未被使用**，不要引入到 src 中）。

---

## 3. 项目结构

```
portfolio2/
├── index.html              # 前台入口（hash 路由 SPA）
├── admin.html              # 后台入口
├── vite.config.js          # 多页构建（index + admin）
├── netlify.toml            # Netlify 构建/函数/重定向配置（注意 SPA 兜底坑，见 §8）
├── schema.sql              # Supabase 建表脚本
├── .env                    # 本地环境变量（Git 已忽略，勿提交！）
├── .env.example            # 环境变量模板（占位符）
├── .nvmrc                  # Node 22（supabase-js 2.112 要求 >=22）
├── migrations/             # 增量迁移 SQL（mac/exe 类型、cover_image 列）
├── src/
│   ├── main.js             # 前台：路由/首页/详情/筛选/lightbox/下载
│   ├── admin.js            # 后台：登录/CRUD/表单/截图/封面上传/GitHub 导入
│   ├── particles.js        # 背景粒子
│   └── style.css           # 前后台共用样式（前台玻璃风 + 后台 8px 间距体系）
├── netlify/functions/      # Netlify Functions（ESM）
│   ├── api.js              # 统一 API 入口：projects CRUD / upload / admin login
│   ├── images.js           # 图片代理
│   ├── sites.js            # dist 静态代理
│   └── lib/
│       ├── db.js           # 数据适配器：Supabase <-> 本地文件系统（自动切换）
│       ├── auth.js         # JWT 登录校验
│       └── unzip.js        # dist zip 解压
├── scripts/
│   ├── local-server.mjs    # 本地模拟 Netlify 服务器（端口 3000）
│   ├── e2e.test.mjs        # 前后台 E2E 测试套件（13 用例）
│   ├── screenshot.mjs      # puppeteer 全页截图
│   ├── admin-shot.mjs      # 后台截图脚本
│   └── inspect.mjs         # 数据检查
└── dist/                   # 构建产物（Git 忽略）
```

---

## 4. 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制 .env.example 为 .env，填入真实值）
cp .env.example .env

# 3. 启动本地服务（模拟 Netlify Functions + 静态托管）
npm run serve        # 或 MODE=supabase npm run serve
# 前台 http://localhost:3000/   后台 http://localhost:3000/admin.html

# 4. 构建产物
npm run build        # 输出 dist/（index.html + admin.html + assets/）
```

**存储模式自动切换**（`netlify/functions/lib/db.js`）：
- `.env` 有 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → **Supabase 模式**（推荐，数据真实入库）
- 否则 → **本地文件系统**（`local-data/` 目录，仅本地开发验证用）

**Node 版本**：必须 **>=22**（`.nvmrc` 已固定）。`@supabase/supabase-js@2.112+` 在 Node <22 会报 `native WebSocket not found`。

---

## 5. 数据模型（Supabase `projects` 表）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | 路由标识（如 `ai-chat`），创建后不可改 |
| `name` | text | 项目名 |
| `type` | text | `web` / `app` / `mac` / `exe`（CHECK 约束）|
| `tagline` / `description` | text | 一句话简介 / 详细介绍 |
| `tech` | jsonb | 技术标签数组 `["Flutter","Dart"]` |
| `cover_from` / `cover_to` | text | 封面渐变起止色 |
| `cover_image` | text | 封面图 URL（可选，优先于渐变；需 migrations 加列）|
| `date` | text | 完成时间（如 `2026-06`）|
| `status` | text | `online` / `wip` / `archived` |
| `url` | text | Web 外链（可选）|
| `allow_embed` | bool | 是否允许 iframe 嵌入 |
| `screenshots` | jsonb | `[{label, image}]` 应用截图 |
| `downloads` | jsonb | `[{platform, url, version, size}]` 下载项 |
| `sort` | int | 排序（越小越靠前）|
| `dist_base` / `dist_uploaded_at` | text/timestamptz | 站内 dist 包状态 |

另一张表 `admin_config`：单行（id=1）存 `password_hash`。

---

## 6. 功能点清单

### 前台（src/main.js）
- **Hash 路由**：`#/` 首页网格、`#/project/:id` 详情
- **类型筛选**：全部 / 网站 / App / Mac / EXE（只更新网格，不整页刷新）
- **统计条**：项目总数 + 各类型计数（只显示计数>0）+ 热门技术 Top4
- **日期时间**：顶部实时时钟（≤900px 视口自动隐藏）
- **卡片**：渐变封面 + 光斑纹理；有 `cover_image` 时显示真实封面图（并隐藏中央类型图标）
- **详情页**：
  - `web`：preview-shell（iframe 预览，支持桌面/手机切换、dist 站内预览）
  - `app/mac/exe`：截图区（纯图片展示，`mac/exe` 为横屏 16:10）+ 下载区
  - 截图点击 → **lightbox 大屏预览**（键盘 ← → 切换、Esc 关闭）
  - 下载卡片显示 `版本徽章 + 文件大小`，顶部有"GitHub 托管，下载可能较慢"提示
- **响应式**：容器左右间距用 `clamp(16px,4vw,32px)` 流体控制（任意宽度 ≥16px），grid `minmax(min(100%,340px),1fr)` 防溢出

### 后台（src/admin.js）
- 登录（JWT，localStorage 存 token）
- 项目列表（SVG 类型图标）/ 新建 / 编辑 / 删除（**自定义 confirmDialog**，异步加载态、完成后关闭）
- 表单：基本信息 + 类型切换（web/app/mac/exe 配置区不同）
- **截图拖拽上传**（复用 `/api/upload`，拖拽/点选/替换，卡片式管理）
- **封面上传**（URL + 上传按钮 + 即时预览）
- **GitHub Releases 导入**：输入仓库地址（自动解析完整链接）→ 拉取资产列表 → 点选自动填入 url/version/size
- Web 类型：外链 URL + iframe 开关 + **dist zip 上传**（解压到 Storage，站内实时预览）

### 后端（netlify/functions/api.js 统一入口）
- `GET /api/projects`、`GET/PUT/DELETE /api/projects/:id`（管理操作需 Bearer token）
- `POST /api/projects/:id/dist`（dist zip 上传解压，≤50MB）
- `POST /api/upload`（图片上传 → Storage publicUrl）
- `POST /api/admin/login` / `GET /api/admin/check`（JWT）
- `GET /sites/:id/*`、`GET /images/*`（静态代理，走独立 function）

---

## 7. 环境变量

| 变量 | 用途 | 必填 |
|---|---|---|
| `SUPABASE_URL` | Supabase 项目地址 | 是（否则本地模式）|
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥（勿泄露）| 是 |
| `ADMIN_PASSWORD` | 后台密码（首次登录用于生成 hash）| 是 |
| `TOKEN_SECRET` | JWT 签名密钥（长随机串）| 是 |
| `NODE_VERSION` | Netlify 显式指定 Node 22（修复 functions WebSocket 报错）| 生产必须 |

**安全**：`.env` 已在 `.gitignore`，**切勿提交**；生产在 Netlify → Environment variables 配置同名变量。

---

## 8. 部署（Netlify）

**Git 集成**（唯一推荐方式，拖放部署无法跑构建/functions）：

1. 推送代码到 GitHub 仓库（如 `MX-future/ai-show`）
2. Netlify → Add new site → Import existing project → 选仓库
3. 构建配置（netlify.toml 已写好，UI 覆盖优先）：
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Base directory: 留空
4. 环境变量：`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `ADMIN_PASSWORD` / `TOKEN_SECRET` / **`NODE_VERSION=22`**
5. Trigger deploy（环境变量/配置变更后需手动触发）

### ⚠️ 踩过的坑（务必记住）
1. **`/* → /index.html` 的 SPA 兜底必须用 `force = false` 或直接不加**：本项目是 hash 路由不需要 fallback；`force = true` 会**强制把真实存在的 assets/*.js 也重定向成 index.html** → 浏览器报 `MIME type of text/html`。已从 netlify.toml 移除并在注释中警示。
2. **Netlify Functions Node 版本**：`.nvmrc` 只控制 build，**不影响 functions runtime**。必须设环境变量 `NODE_VERSION=22`，否则 `@supabase/supabase-js@2.112` 报 `native WebSocket not found` → API 500。
3. **内容去重陷阱**：Netlify 按内容哈希去重，前端产物不变时显示 "0 new files"。需要强制重新上传时，改动 src 让 vite 生成新哈希即可。
4. **本地数据即线上数据**：本地 `.env` 有 Supabase 变量时，本地添加的项目直接写入 Supabase 数据库，线上部署后即见（前提：线上配好环境变量）。

---

## 9. 测试

```bash
# 前置：先启动本地服务（npm run serve）
node --test scripts/e2e.test.mjs
```
13 个用例：前台（首页渲染/筛选/详情/web 预览/mac 横屏/lightbox/响应式间距≥16px）+ 后台（登录失败/登录列表/CRUD 临时项目/配置区/改密码/API 鉴权）。

**安全约定**：后台 CRUD 测试只操作 `e2e-test-*` 前缀的临时项目，测试结束自动清理；切勿在测试中删除真实项目数据（历史上曾因 fetch mock 拦截失效误删过真实项目，已恢复）。

---

## 10. 常用操作速查

| 需求 | 操作 |
|---|---|
| 加新项目 | 后台 → 新建 → 填表单 → 保存 |
| 添加 mac/exe 项目 | 类型选 Mac/Windows，上传截图（横屏）+ 用 GH 按钮导入 GitHub Releases 下载 |
| 给项目加封面图 | 后台编辑 → 封面图字段 → 上传/粘贴 URL → 保存 |
| 部署新版本 | 本地改代码 → `git push origin main` → Netlify 自动构建（改环境变量需手动 Trigger）|
| 重置后台密码 | 改 `ADMIN_PASSWORD` 环境变量后重新部署，重新登录 |
