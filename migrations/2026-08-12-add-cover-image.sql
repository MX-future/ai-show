-- ============================================================
-- 迁移：projects 表新增 cover_image（项目封面图 URL，可选）
-- 在 Supabase Dashboard → SQL Editor 中执行一次即可
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_image text default '';
