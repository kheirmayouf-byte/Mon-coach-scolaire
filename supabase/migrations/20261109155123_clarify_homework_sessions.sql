begin;
create table public.mcs_import_state(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null unique,period_from date not null,period_to date not null check(period_to>=period_from),
 synced_at timestamptz not null default now(),version integer not null default 1 check(version>0),
 foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create index mcs_import_state_family on public.mcs_import_state(family_id);
alter table public.mcs_import_state enable row level security;
revoke all on public.mcs_import_state from anon,authenticated;
grant select,insert on public.mcs_import_state to authenticated;
grant update(period_from,period_to,synced_at,version) on public.mcs_import_state to authenticated;
create policy mcs_import_state_select on public.mcs_import_state for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_import_state_insert on public.mcs_import_state for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_import_state_update on public.mcs_import_state for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create trigger mcs_import_state_version before update on public.mcs_import_state for each row execute function public.mcs_require_next_version();
create table public.mcs_workspaces(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,task_id uuid not null unique references public.mcs_tasks(id) on delete cascade,
 answers text not null default '' check(length(answers)<=20000),version integer not null default 1 check(version>0),
 foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create index mcs_workspaces_family_child on public.mcs_workspaces(family_id,child_id);
alter table public.mcs_workspaces enable row level security;
revoke all on public.mcs_workspaces from anon,authenticated;
grant select,insert on public.mcs_workspaces to authenticated;
grant update(answers,version) on public.mcs_workspaces to authenticated;
create policy mcs_workspaces_select on public.mcs_workspaces for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_workspaces_insert on public.mcs_workspaces for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_workspaces.child_id and t.family_id=mcs_workspaces.family_id));
create policy mcs_workspaces_update on public.mcs_workspaces for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_workspaces.child_id and t.family_id=mcs_workspaces.family_id));
create trigger mcs_workspaces_version before update on public.mcs_workspaces for each row execute function public.mcs_require_next_version();
-- All selected task updates and the successful refresh stamp commit together.
create function public.mcs_refresh_ed(p_family uuid,p_child uuid,p_from date,p_to date,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.mcs_children c join public.mcs_members m on m.family_id=c.family_id where c.id=p_child and c.family_id=p_family and m.user_id=auth.uid()) then raise exception 'Child unavailable'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>13 then raise exception 'Invalid period';end if;
 if jsonb_typeof(p_rows)<>'array' or exists(select 1 from jsonb_array_elements(p_rows) r where (r->>'child_id')::uuid is distinct from p_child) then raise exception 'Invalid child';end if;
 result:=public.mcs_apply_ed_import(p_family,p_rows);
 insert into public.mcs_import_state(family_id,child_id,period_from,period_to,synced_at) values(p_family,p_child,p_from,p_to,now())
 on conflict(child_id) do update set period_from=excluded.period_from,period_to=excluded.period_to,synced_at=now(),version=public.mcs_import_state.version+1;
 return result;
end $$;
revoke all on function public.mcs_refresh_ed(uuid,uuid,date,date,jsonb) from public,anon;
grant execute on function public.mcs_refresh_ed(uuid,uuid,date,date,jsonb) to authenticated;
commit;
