begin;
create table public.mcs_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 family_id uuid not null references public.mcs_families(id) on delete cascade,
 sealed_state text not null check(length(sealed_state)<=80000),
 updated_at timestamptz not null default now()
);
alter table public.mcs_connections enable row level security;
revoke all on public.mcs_connections from public,anon,authenticated;
grant select,insert,update,delete on public.mcs_connections to service_role;
create policy mcs_connections_server on public.mcs_connections for all to service_role using(true) with check(true);
create index mcs_connections_family on public.mcs_connections(family_id);
create table public.mcs_timetables (
 child_id uuid primary key,
 family_id uuid not null references public.mcs_families(id) on delete cascade,
 events jsonb not null default '[]' check(jsonb_typeof(events)='array' and jsonb_array_length(events)<=300 and octet_length(events::text)<=300000),
 period_from date not null,period_to date not null check(period_to>=period_from and period_to-period_from<=13),
 synced_at timestamptz not null default now(),
 foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
alter table public.mcs_timetables enable row level security;
revoke all on public.mcs_timetables from public,anon,authenticated;
grant select,insert,update,delete on public.mcs_timetables to authenticated;
create index mcs_timetables_family on public.mcs_timetables(family_id);
create policy mcs_timetables_read on public.mcs_timetables for select to authenticated
 using(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_timetables_insert on public.mcs_timetables for insert to authenticated
 with check(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_timetables_update on public.mcs_timetables for update to authenticated
 using(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())))
 with check(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_timetables_delete on public.mcs_timetables for delete to authenticated
 using(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
commit;