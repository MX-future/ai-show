# AI 项目作品集（Netlify + Supabase）

个人作品集网站：展示 AI 开发的项目。App 类型展示截图 + 下载地址；Web 类型**按需实时预览**（iframe 路由式加载，不用把所有项目都单独部署）。自带**管理后台**，可视化配置项目、上传截图、上传 Web 项目的 dist 包。

## 架构

```
前台 (/) + 后台 (/admin)
        │
        ▼
Netlify Functions（无服务器 API）
  /api/*    → 登录 / 项目 CRUD / dist 上传 / 图片上传
  /sites/:id/* → dist 静态代理（核心！每个项目只是站点里的一个路由）
        │
        ▼
Supabase：projects 表（项目数据）+ Storage（dist 文件 / 截图）
```

**核心思路**：Web 项目的 dist 包上传后解压到 Supabase Storage，通过 `/sites/:id/` 代理访问 —— 所有项目共享这一个 Netlify 站点，**不需要为每个项目单独部署**。前端 iframe 按需加载（进入详情页才创建，离开即销毁），预览源优先级：本地托管 dist > 外链 url。

## 本地开发验证（已配置 Supabase，无需本地文件系统）

> ✅ 本项目已连接 Supabase 项目 **my-show**（ref: `wktovfsagveylhedqqrj`，东京区），
> 表与 Storage 桶已建好，`.env` 已写入真实密钥（已被 .gitignore 忽略）。
> 本地服务启动时自动加载 `.env` → 自动走 Supabase 模式。

```bash
# 1. 安装依赖（需 Node 18+）
npm install

# 2. 构建前端 + 启动本地服务（Supabase 模式）
npm run build
npm run serve

# 打开
#   前台: http://localhost:3000
#   后台: http://localhost:3000/admin.html  （默认密码 admin123）
```

> 提示：去掉 `.env` 中的 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 即回退到
> 本地文件系统模式（数据存 `local-data/`），两种模式代码完全一致。

## 部署到 Netlify

### 1. 准备 Supabase
- 在 [supabase.com](https://supabase.com) 新建项目
- SQL Editor 执行 `schema.sql`（建表 + 建 Storage 桶）
- 记下 Project URL 和 `service_role` key（Settings → API）

### 2. 部署到 Netlify
- 方式一：拖拽部署 —— 把本项目文件夹拖到 [app.netlify.com/drop](https://app.netlify.com/drop)
- 方式二：连接 Git 仓库，构建命令 `npm run build`，发布目录 `dist`

### 3. 配置环境变量（Netlify → Site → Environment variables）
| 变量 | 说明 |
|---|---|
| `SUPABASE_URL` | 你的 Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `ADMIN_PASSWORD` | 管理后台登录密码 |
| `TOKEN_SECRET` | 任意随机长字符串（签名登录 token） |

配置后**重新部署一次**（Functions 环境变量生效）。

## 使用流程

1. 打开 `/admin.html` 登录
2. 新建项目：
   - **Web 类型**：填写介绍 → 可选填外链 URL → **上传 dist 包（zip）** → 保存。上传后前台详情页自动走 `/sites/:id/` 本地预览，无需单独部署
   - **App 类型**：添加截图（可填图片 URL）+ 下载地址 → 保存
3. 前台自动更新，刷新即可看到

## 已知限制
- 上传的 dist 若有绝对路径 `/xxx.js` 依赖，需保证打包时 `base: './'`（相对路径），否则资源 404
- 管理接口仅靠密码 token 保护，适合个人使用；如需更强安全建议叠加 Netlify Identity 或网关鉴权
- 单个 zip 上限：函数侧限制 300MB（`netlify.toml` 可调），图片 10MB
