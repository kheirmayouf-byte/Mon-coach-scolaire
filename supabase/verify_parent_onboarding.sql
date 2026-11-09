-- Synthetic account via management SQL, no Auth email is sent; all rows are rolled back.
-- Hosted management role cannot impersonate supabase_auth_admin; real Auth flow remains to verify.
begin;
insert into public.mcs_families(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into mcs_private.approved_parents(email,family_id) values('mcs-approved@example.invalid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$begin
 begin insert into auth.users(id,email) values('33333333-3333-4333-8333-333333333333','not-approved@example.invalid');raise exception 'Unknown email accepted';exception when check_violation then null;end;
end$$;
insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','mcs-approved@example.invalid');
reset role;
do $$begin if exists(select 1 from public.mcs_members where user_id='11111111-1111-4111-8111-111111111111') then raise exception 'Unconfirmed email was granted access';end if;end$$;
update auth.users set email_confirmed_at=now() where id='11111111-1111-4111-8111-111111111111';
reset role;
do $$begin if not exists(select 1 from public.mcs_members where user_id='11111111-1111-4111-8111-111111111111' and family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'Confirmed approved account was not linked';end if;end$$;
set local role authenticated;
do $$begin begin perform * from mcs_private.approved_parents;raise exception 'Client read the private allowlist';exception when insufficient_privilege then null;end;end$$;
reset role;
select 'PASS: unapproved signup blocked; confirmation required; approved parent linked; private allowlist inaccessible' as verification;
rollback;
