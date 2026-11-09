begin;
alter table public.mcs_tasks add column detail_missing boolean not null default false;
alter table public.mcs_tasks add column is_assessment boolean not null default false;
alter table public.mcs_tasks add column source_key text check(length(source_key)<=200);
alter table public.mcs_tasks add constraint mcs_tasks_source_unique unique(child_id,source_key);
grant update(detail_missing,is_assessment) on public.mcs_tasks to authenticated;
create table public.mcs_planning_preferences(
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null unique,
 week_minutes integer[] not null check(cardinality(week_minutes)=7 and array_position(week_minutes,null) is null and 0<=all(week_minutes) and 120>=all(week_minutes)),
 day_labels text[] not null check(cardinality(day_labels)=7 and array_position(day_labels,null) is null),
 day_starts text[] not null check(cardinality(day_starts)=7 and array_position(day_starts,null) is null),
 alternating_monday boolean not null default false,
 monday_anchor date check(extract(isodow from monday_anchor)=1),
 monday_home_minutes integer not null default 30 check(monday_home_minutes between 0 and 120),
 monday_home_start text not null default '' check(length(monday_home_start)<=100),
 vacation_mode boolean not null default false,
 vacation_minutes integer not null default 30 check(vacation_minutes between 5 and 40),
 vacation_slot text not null default 'morning' check(vacation_slot in ('morning','noon')),
 version integer not null default 1 check(version>0),
 foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade,
 check(not alternating_monday or monday_anchor is not null)
);
create index mcs_planning_family on public.mcs_planning_preferences(family_id);
create index mcs_planning_child_family on public.mcs_planning_preferences(child_id,family_id);
alter table public.mcs_planning_preferences enable row level security;
revoke all on public.mcs_planning_preferences from public,anon,authenticated;
grant select,insert on public.mcs_planning_preferences to authenticated;
grant update(week_minutes,day_labels,day_starts,alternating_monday,monday_anchor,monday_home_minutes,monday_home_start,vacation_mode,vacation_minutes,vacation_slot,version) on public.mcs_planning_preferences to authenticated;
create policy mcs_planning_family_access on public.mcs_planning_preferences for all to authenticated
 using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())))
 with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create trigger mcs_planning_version before update on public.mcs_planning_preferences for each row execute function public.mcs_require_next_version();
commit;
