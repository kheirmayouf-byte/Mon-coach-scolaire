begin;
create table public.mcs_agenda_rules(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,task_id uuid not null unique references public.mcs_tasks(id) on delete cascade,
 category text check(category in('exercise','exercise_assessment','revision','revision_assessment','national')),
 placements jsonb not null default '{}'::jsonb check(jsonb_typeof(placements)='object' and octet_length(placements::text)<=32000),
 version integer not null default 1 check(version>0),
 foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create index mcs_agenda_rules_family_child on public.mcs_agenda_rules(family_id,child_id);
alter table public.mcs_agenda_rules enable row level security;
revoke all on public.mcs_agenda_rules from anon,authenticated;
grant select,insert on public.mcs_agenda_rules to authenticated;
grant update(category,placements,version) on public.mcs_agenda_rules to authenticated;
create policy mcs_agenda_rules_select on public.mcs_agenda_rules for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_agenda_rules_insert on public.mcs_agenda_rules for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_agenda_rules.child_id and t.family_id=mcs_agenda_rules.family_id));
create policy mcs_agenda_rules_update on public.mcs_agenda_rules for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_agenda_rules.child_id and t.family_id=mcs_agenda_rules.family_id));
create trigger mcs_agenda_rules_version before update on public.mcs_agenda_rules for each row execute function public.mcs_require_next_version();
commit;
