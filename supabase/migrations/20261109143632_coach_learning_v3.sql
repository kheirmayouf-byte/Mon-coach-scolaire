begin;
alter table public.mcs_tasks add column attachment_refs jsonb not null default '[]' check(jsonb_typeof(attachment_refs)='array' and jsonb_array_length(attachment_refs)<=30);
alter table public.mcs_tasks add column source_updated_at timestamptz;
grant update(attachment_refs,source_updated_at) on public.mcs_tasks to authenticated;
create table public.mcs_profiles(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null unique,settings jsonb not null default '{}' check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=40000),
 version integer not null default 1 check(version>0),foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create table public.mcs_parent_settings(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 user_id uuid not null unique references auth.users(id) on delete cascade,display_name text not null default '' check(length(display_name)<=50),version integer not null default 1 check(version>0)
);
create table public.mcs_sessions(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,task_id uuid references public.mcs_tasks(id) on delete set null,subject text not null check(length(subject) between 1 and 80),
 seconds integer not null default 0 check(seconds between 0 and 14400),status text not null default 'paused' check(status in ('running','paused','completed')),
 work_mode text not null default 'screen' check(work_mode in ('screen','paper')),rating text check(rating in ('easy','adapted','hard')),
 created_at timestamptz not null default now(),version integer not null default 1 check(version>0),foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create unique index mcs_sessions_one_active_child on public.mcs_sessions(child_id) where status in ('running','paused');
create table public.mcs_attempts(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,task_id uuid references public.mcs_tasks(id) on delete set null,topic text not null check(length(topic) between 1 and 200),
 score integer not null check(score>=0),total integer not null check(total between 1 and 20 and score<=total),assisted boolean not null default false,
 duration_seconds integer not null default 0 check(duration_seconds between 0 and 7200),details jsonb not null default '[]' check(jsonb_typeof(details)='array' and octet_length(details::text)<=20000),
 question_ids jsonb not null default '[]' check(jsonb_typeof(question_ids)='array' and jsonb_array_length(question_ids)<=20),
 self_before text check(self_before in ('help','unsure','ready')),self_after text check(self_after in ('help','unsure','ready')),
 created_at timestamptz not null default now(),version integer not null default 1 check(version>0),foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create table public.mcs_reminders(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,task_id uuid references public.mcs_tasks(id) on delete set null,topic text not null check(length(topic) between 1 and 200),due date not null,
 minutes integer not null check(minutes in (5,10)),status text not null default 'planned' check(status in ('planned','done','skipped')),
 version integer not null default 1 check(version>0),foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade
);
create table public.mcs_documents(
 id uuid primary key default gen_random_uuid(),family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null,task_id uuid references public.mcs_tasks(id) on delete set null,name text not null check(length(name) between 1 and 200),
 subject text not null default '' check(length(subject)<=80),mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp','text/plain')),
 bytes integer not null check(bytes between 1 and 10485760),object_path text not null unique,
 content_text text not null default '' check(length(content_text)<=60000),verified boolean not null default false,
 status text not null default 'uploaded' check(status in ('uploaded','needs_review','verified')),source_key text check(length(source_key)<=200),
 created_at timestamptz not null default now(),version integer not null default 1 check(version>0),
 unique(child_id,source_key),foreign key(child_id,family_id) references public.mcs_children(id,family_id) on delete cascade,
 check(object_path=family_id::text||'/'||child_id::text||'/'||id::text),check(not verified or length(trim(content_text))>0)
);
create index mcs_profiles_family_child on public.mcs_profiles(family_id,child_id);
alter table public.mcs_profiles enable row level security;
revoke all on public.mcs_profiles from public,anon,authenticated;
grant select,insert,delete on public.mcs_profiles to authenticated;
create policy mcs_profiles_read on public.mcs_profiles for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_profiles_delete on public.mcs_profiles for delete to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_profiles_insert on public.mcs_profiles for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_profiles_update on public.mcs_profiles for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
grant update(settings,version) on public.mcs_profiles to authenticated;
create trigger mcs_profiles_version before update on public.mcs_profiles for each row execute function public.mcs_require_next_version();
create index mcs_sessions_family_child on public.mcs_sessions(family_id,child_id);
alter table public.mcs_sessions enable row level security;
revoke all on public.mcs_sessions from public,anon,authenticated;
grant select,insert,delete on public.mcs_sessions to authenticated;
create policy mcs_sessions_read on public.mcs_sessions for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_sessions_delete on public.mcs_sessions for delete to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_sessions_insert on public.mcs_sessions for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_sessions.child_id and t.family_id=mcs_sessions.family_id)));
create policy mcs_sessions_update on public.mcs_sessions for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_sessions.child_id and t.family_id=mcs_sessions.family_id)));
grant update(seconds,status,work_mode,rating,version) on public.mcs_sessions to authenticated;
create trigger mcs_sessions_version before update on public.mcs_sessions for each row execute function public.mcs_require_next_version();
create index mcs_sessions_task on public.mcs_sessions(task_id);
create index mcs_attempts_family_child on public.mcs_attempts(family_id,child_id);
alter table public.mcs_attempts enable row level security;
revoke all on public.mcs_attempts from public,anon,authenticated;
grant select,insert,delete on public.mcs_attempts to authenticated;
create policy mcs_attempts_read on public.mcs_attempts for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_attempts_delete on public.mcs_attempts for delete to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_attempts_insert on public.mcs_attempts for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_attempts.child_id and t.family_id=mcs_attempts.family_id)));
create policy mcs_attempts_update on public.mcs_attempts for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_attempts.child_id and t.family_id=mcs_attempts.family_id)));
grant update(self_after,version) on public.mcs_attempts to authenticated;
create trigger mcs_attempts_version before update on public.mcs_attempts for each row execute function public.mcs_require_next_version();
create index mcs_attempts_task on public.mcs_attempts(task_id);
create index mcs_reminders_family_child on public.mcs_reminders(family_id,child_id);
alter table public.mcs_reminders enable row level security;
revoke all on public.mcs_reminders from public,anon,authenticated;
grant select,insert,delete on public.mcs_reminders to authenticated;
create policy mcs_reminders_read on public.mcs_reminders for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_reminders_delete on public.mcs_reminders for delete to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_reminders_insert on public.mcs_reminders for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_reminders.child_id and t.family_id=mcs_reminders.family_id)));
create policy mcs_reminders_update on public.mcs_reminders for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_reminders.child_id and t.family_id=mcs_reminders.family_id)));
grant update(due,status,version) on public.mcs_reminders to authenticated;
create trigger mcs_reminders_version before update on public.mcs_reminders for each row execute function public.mcs_require_next_version();
create index mcs_reminders_task on public.mcs_reminders(task_id);
create index mcs_documents_family_child on public.mcs_documents(family_id,child_id);
alter table public.mcs_documents enable row level security;
revoke all on public.mcs_documents from public,anon,authenticated;
grant select,insert,delete on public.mcs_documents to authenticated;
create policy mcs_documents_read on public.mcs_documents for select to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_documents_delete on public.mcs_documents for delete to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_documents_insert on public.mcs_documents for insert to authenticated with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_documents.child_id and t.family_id=mcs_documents.family_id)));
create policy mcs_documents_update on public.mcs_documents for update to authenticated using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))) with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())) and (task_id is null or exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_documents.child_id and t.family_id=mcs_documents.family_id)));
grant update(content_text,verified,status,version) on public.mcs_documents to authenticated;
create trigger mcs_documents_version before update on public.mcs_documents for each row execute function public.mcs_require_next_version();
create index mcs_documents_task on public.mcs_documents(task_id);
alter table public.mcs_parent_settings enable row level security;
revoke all on public.mcs_parent_settings from public,anon,authenticated;
grant select,insert on public.mcs_parent_settings to authenticated;
grant update(display_name,version) on public.mcs_parent_settings to authenticated;
create index mcs_parent_settings_family on public.mcs_parent_settings(family_id);
create policy mcs_parent_settings_own on public.mcs_parent_settings for all to authenticated
 using(user_id=(select auth.uid()) and family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())))
 with check(user_id=(select auth.uid()) and family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create trigger mcs_parent_settings_version before update on public.mcs_parent_settings for each row execute function public.mcs_require_next_version();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('mcs-documents','mcs-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','text/plain'])
 on conflict(id) do nothing;
create policy mcs_docs_storage_read on storage.objects for select to authenticated using(bucket_id='mcs-documents' and exists(select 1 from public.mcs_children c join public.mcs_members m on m.family_id=c.family_id where m.user_id=(select auth.uid()) and c.family_id::text=split_part(storage.objects.name,'/',1) and c.id::text=split_part(storage.objects.name,'/',2)));
create policy mcs_docs_storage_insert on storage.objects for insert to authenticated with check(bucket_id='mcs-documents' and array_length(string_to_array(name,'/'),1)=3 and exists(select 1 from public.mcs_children c join public.mcs_members m on m.family_id=c.family_id where m.user_id=(select auth.uid()) and c.family_id::text=split_part(storage.objects.name,'/',1) and c.id::text=split_part(storage.objects.name,'/',2)));
create policy mcs_docs_storage_delete on storage.objects for delete to authenticated using(bucket_id='mcs-documents' and exists(select 1 from public.mcs_children c join public.mcs_members m on m.family_id=c.family_id where m.user_id=(select auth.uid()) and c.family_id::text=split_part(storage.objects.name,'/',1) and c.id::text=split_part(storage.objects.name,'/',2)));
create function public.mcs_apply_ed_import(p_family uuid,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; count_changed integer; added integer:=0; updated integer:=0;
begin
 if auth.uid() is null or not exists(select 1 from public.mcs_members where user_id=auth.uid() and family_id=p_family) then raise exception 'Family unavailable'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 then raise exception 'Invalid import'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if left(r->>'source_key',length('ecoledirecte:'))<>'ecoledirecte:' then raise exception 'Invalid source'; end if;
  if r->>'expected_version' is null then
   insert into public.mcs_tasks(id,family_id,child_id,subject,description,given,due,minutes,done,detail_missing,is_assessment,source_key,attachment_refs,source_updated_at)
   values((r->>'id')::uuid,p_family,(r->>'child_id')::uuid,r->>'subject',r->>'description',(r->>'given')::date,(r->>'due')::date,(r->>'minutes')::integer,false,(r->>'detail_missing')::boolean,(r->>'is_assessment')::boolean,r->>'source_key',coalesce(r->'attachment_refs','[]'::jsonb),now());
   added:=added+1;
  else
   update public.mcs_tasks set subject=r->>'subject',description=r->>'description',given=(r->>'given')::date,due=(r->>'due')::date,detail_missing=(r->>'detail_missing')::boolean,is_assessment=(r->>'is_assessment')::boolean,attachment_refs=coalesce(r->'attachment_refs','[]'::jsonb),source_updated_at=now(),version=version+1
    where id=(r->>'id')::uuid and child_id=(r->>'child_id')::uuid and family_id=p_family and source_key=r->>'source_key' and version=(r->>'expected_version')::integer;
   get diagnostics count_changed=row_count;
   if count_changed<>1 then raise exception 'Import conflict: refresh preview'; end if;
   updated:=updated+1;
  end if;
 end loop;
 return jsonb_build_object('added',added,'updated',updated);
end $$;
revoke all on function public.mcs_apply_ed_import(uuid,jsonb) from public,anon;
grant execute on function public.mcs_apply_ed_import(uuid,jsonb) to authenticated;
commit;
