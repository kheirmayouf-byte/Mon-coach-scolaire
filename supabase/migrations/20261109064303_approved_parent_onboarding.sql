begin;
-- Private, administrator-managed allowlist; no personal data in migrations.
create schema mcs_private;
revoke all on schema mcs_private from public,anon,authenticated;
create table mcs_private.approved_parents(
 email text primary key check(email=lower(trim(email)) and position('@' in email)>1),
 family_id uuid not null references public.mcs_families(id) on delete cascade
);
alter table mcs_private.approved_parents enable row level security;
revoke all on mcs_private.approved_parents from public,anon,authenticated;
create index approved_parents_family on mcs_private.approved_parents(family_id);
create function mcs_private.require_approved_parent() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email is null or coalesce(new.is_anonymous,false) or not exists(
  select 1 from mcs_private.approved_parents a where a.email=lower(trim(new.email))
 ) then raise exception 'Parent registration is not approved' using errcode='23514';end if;
 return new;
end $$;
create function mcs_private.attach_confirmed_parent() returns trigger
language plpgsql security definer set search_path='' as $$
declare fid uuid;
begin
 if new.email_confirmed_at is not null then
  select a.family_id into fid from mcs_private.approved_parents a where a.email=lower(trim(new.email));
  if fid is not null then
   insert into public.mcs_members(user_id,family_id) values(new.id,fid) on conflict(user_id) do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function mcs_private.require_approved_parent(),mcs_private.attach_confirmed_parent() from public,anon,authenticated;
create trigger mcs_approved_parent_before_insert before insert on auth.users for each row execute function mcs_private.require_approved_parent();
create trigger mcs_confirmed_parent_after_insert after insert on auth.users for each row execute function mcs_private.attach_confirmed_parent();
create trigger mcs_confirmed_parent_after_update after update of email_confirmed_at on auth.users for each row execute function mcs_private.attach_confirmed_parent();
commit;
