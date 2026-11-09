import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Auth server role can run closed registration and verified-parent triggers',async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role supabase_auth_admin;create schema auth;grant usage on schema auth to supabase_auth_admin,anon,authenticated;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);alter table auth.users owner to supabase_auth_admin;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile('supabase/001_family_security.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261109064303_approved_parent_onboarding.sql','utf8'));
 await db.exec(`insert into mcs_families(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');insert into mcs_private.approved_parents values('approved@example.invalid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');set role supabase_auth_admin;`);
 await assert.rejects(db.query(`insert into auth.users values('33333333-3333-4333-8333-333333333333','unknown@example.invalid',null,false)`),/not approved/);
 await db.exec(`insert into auth.users values('11111111-1111-4111-8111-111111111111','approved@example.invalid',null,false);reset role;`);
 assert.equal((await db.query('select * from mcs_members')).rows.length,0);
 await db.exec(`set role supabase_auth_admin;update auth.users set email_confirmed_at=now() where id='11111111-1111-4111-8111-111111111111';reset role;`);
 assert.equal((await db.query('select * from mcs_members')).rows.length,1);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from mcs_private.approved_parents'),/permission denied/);
 await db.close();
});
