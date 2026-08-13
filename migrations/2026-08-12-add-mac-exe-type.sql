-- ============================================================
-- 迁移：项目类型增加 mac / exe
-- 在 Supabase Dashboard → SQL Editor 中执行一次即可
-- ============================================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_type_check
  CHECK (type IN ('web', 'app', 'mac', 'exe'));

-- 验证：
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'projects'::regclass AND contype = 'c';
