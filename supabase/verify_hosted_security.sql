-- Run in one SQL call; everything, including the synthetic Auth users, is rolled back.
begin;
insert into public.mcs_families(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into mcs_private.approved_parents(email,family_id) values
('mcs-test-a@example.invalid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('mcs-test-b@example.invalid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
('mcs-test-outsider@example.invalid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','mcs-test-a@example.invalid'),
('22222222-2222-4222-8222-222222222222','mcs-test-b@example.invalid'),
('33333333-3333-4333-8333-333333333333','mcs-test-outsider@example.invalid');
insert into public.mcs_members(user_id,family_id) values
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.mcs_children(id,family_id,name) values
('aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Test A'),
('bbbbbbbb-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Test B');
insert into public.mcs_tasks(id,family_id,child_id,subject,description,given,due) values
('aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-111111111111','Test','Synthetic','2026-11-09','2026-11-10');
insert into public.mcs_planning_preferences(family_id,child_id,week_minutes,day_labels,day_starts) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-111111111111',array_fill(30,array[7]),array_fill('Home'::text,array[7]),array_fill(''::text,array[7])),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-2222-4222-8222-222222222222',array_fill(30,array[7]),array_fill('Home'::text,array[7]),array_fill(''::text,array[7]));
set local role anon;
do $$begin
 begin perform * from public.mcs_tasks; raise exception 'Anonymous access unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin perform public.is_family_parent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'Legacy RPC unexpectedly allowed'; exception when insufficient_privilege then null; end;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$begin
 if exists(select 1 from public.mcs_tasks) or exists(select 1 from public.mcs_children) or exists(select 1 from public.mcs_planning_preferences) then raise exception 'Unrelated account can read private rows'; end if;
 begin insert into public.mcs_members values('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'Self membership unexpectedly allowed'; exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$declare affected integer; begin
 if exists(select 1 from public.mcs_tasks) then raise exception 'Cross-family read allowed'; end if;
 update public.mcs_tasks set done=true,version=2 where id='aaaaaaaa-3333-4333-8333-333333333333'; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Cross-family update allowed'; end if;
 begin insert into public.mcs_tasks(family_id,child_id,subject,description,given,due) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-1111-4111-8111-111111111111','Test','Synthetic','2026-11-09','2026-11-10'); raise exception 'Cross-family child link allowed'; exception when foreign_key_violation then null; end;
end$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$declare affected integer; begin
 if (select count(*) from public.mcs_planning_preferences)<>1 then raise exception 'Planning isolation failed';end if;
 update public.mcs_planning_preferences set monday_home_minutes=35,version=2 where child_id='aaaaaaaa-1111-4111-8111-111111111111' and version=1;get diagnostics affected=row_count;if affected<>1 then raise exception 'Planning update failed';end if;
 if (select count(*) from public.mcs_tasks)<>1 then raise exception 'Own rows unavailable'; end if;
 update public.mcs_tasks set done=true,version=2 where id='aaaaaaaa-3333-4333-8333-333333333333' and version=1;get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Own update failed'; end if;
 update public.mcs_tasks set done=false,version=2 where id='aaaaaaaa-3333-4333-8333-333333333333' and version=1;get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Stale update overwrote current version'; end if;
 begin update public.mcs_tasks set family_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='aaaaaaaa-3333-4333-8333-333333333333';raise exception 'Reassignment allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'PASS: anon denied; unrelated account denied; two families isolated; child FK enforced; CAS enforced; ownership immutable' as verification;
rollback;
