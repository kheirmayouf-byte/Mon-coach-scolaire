-- Read-only metadata, no child data. Run on the existing project BEFORE migration.
select schemaname,tablename,rowsecurity from pg_tables where schemaname='public';
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage');
select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated','PUBLIC') order by table_name,grantee;
select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select id,public from storage.buckets;
-- Also inspect exposed views, Storage policies, Auth signup/redirect settings,
-- enabled providers, backups, database advisors and unused legacy tables.
