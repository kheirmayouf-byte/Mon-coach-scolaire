-- New isolated tables. Does not alter or certify pre-existing tables.
-- Apply once after inspecting audit.sql; back up the existing project first.
begin;
create table public.mcs_families(id uuid primary key default gen_random_uuid());
create table public.mcs_members(
 user_id uuid primary key references auth.users(id) on delete cascade,
 family_id uuid not null references public.mcs_families(id) on delete cascade
);
create index mcs_members_family on public.mcs_members(family_id);
create table public.mcs_children(
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.mcs_families(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 50),
 unique(id,family_id),unique(family_id,name)
);
create table public.mcs_tasks(
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,
 subject text not null check(length(trim(subject)) between 1 and 80),
 description text not null check(length(trim(description)) between 1 and 4000),
 given date not null,due date not null check(due>=given),
 minutes integer not null default 20 check(minutes between 5 and 240),
 done boolean not null default false,
 version integer not null default 1 check(version>0),
 foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create index mcs_tasks_family_child_due on public.mcs_tasks(family_id,child_id,due);
create table public.mcs_cards(
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,
 subject text not null check(length(trim(subject)) between 1 and 80),
 question text not null check(length(trim(question)) between 1 and 1000),
 answer text not null check(length(trim(answer)) between 1 and 4000),
 level integer not null default 0 check(level between 0 and 4),
 next_review date not null default current_date,
 version integer not null default 1 check(version>0),
 foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create index mcs_cards_family_child_review on public.mcs_cards(family_id,child_id,next_review);
alter table public.mcs_families enable row level security;
alter table public.mcs_members enable row level security;
alter table public.mcs_children enable row level security;
alter table public.mcs_tasks enable row level security;
alter table public.mcs_cards enable row level security;
-- Revoke defaults: browser cannot provision families or grant itself membership.
revoke all on public.mcs_families,public.mcs_members,public.mcs_children,public.mcs_tasks,public.mcs_cards from anon,authenticated;
grant select on public.mcs_members,public.mcs_children,public.mcs_tasks,public.mcs_cards to authenticated;
grant insert,delete on public.mcs_tasks,public.mcs_cards to authenticated;
grant update(subject,description,given,due,minutes,done,version) on public.mcs_tasks to authenticated;
grant update(subject,question,answer,level,next_review,version) on public.mcs_cards to authenticated;
grant update(name) on public.mcs_children to authenticated;
create policy mcs_own_membership on public.mcs_members for select to authenticated using(user_id=(select auth.uid()));
create policy mcs_children_read on public.mcs_children for select to authenticated using(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_children_update on public.mcs_children for update to authenticated using(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_tasks_family on public.mcs_tasks for all to authenticated using(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_cards_family on public.mcs_cards for all to authenticated using(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in (select family_id from public.mcs_members where user_id=(select auth.uid())));
create function public.mcs_require_next_version() returns trigger language plpgsql set search_path='' as $$
begin
 if new.version<>old.version+1 then raise exception 'Version must increment by one'; end if;
 return new;
end $$;
revoke all on function public.mcs_require_next_version() from public,anon,authenticated;
create trigger mcs_tasks_version before update on public.mcs_tasks for each row execute function public.mcs_require_next_version();
create trigger mcs_cards_version before update on public.mcs_cards for each row execute function public.mcs_require_next_version();
-- SECURITY INVOKER: normal RLS and column grants still apply. Atomic rename.
create function public.mcs_rename_children(names jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb; count_changed integer;
begin
 if jsonb_typeof(names)<>'array' or jsonb_array_length(names)>20 then raise exception 'Invalid names'; end if;
 for item in select value from jsonb_array_elements(names) loop
  update public.mcs_children set name=item->>'name' where id=(item->>'id')::uuid;
  get diagnostics count_changed=row_count;
  if count_changed<>1 then raise exception 'Profile unavailable'; end if;
 end loop;
end $$;
revoke all on function public.mcs_rename_children(jsonb) from public,anon;
grant execute on function public.mcs_rename_children(jsonb) to authenticated;
commit;
