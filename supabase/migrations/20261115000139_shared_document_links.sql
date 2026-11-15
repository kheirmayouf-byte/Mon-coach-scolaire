begin;
create table public.mcs_document_links(
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.mcs_families(id) on delete cascade,
 child_id uuid not null references public.mcs_children(id) on delete cascade,
 document_id uuid not null references public.mcs_documents(id) on delete cascade,
 task_id uuid not null references public.mcs_tasks(id) on delete cascade,
 unique(document_id,task_id)
);
create index mcs_document_links_family_child on public.mcs_document_links(family_id,child_id);
create index mcs_document_links_task on public.mcs_document_links(task_id);
alter table public.mcs_document_links enable row level security;
revoke all on public.mcs_document_links from public,anon,authenticated;
grant select,insert,delete on public.mcs_document_links to authenticated;
create policy mcs_document_links_read on public.mcs_document_links for select to authenticated
 using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_document_links_delete on public.mcs_document_links for delete to authenticated
 using(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid())));
create policy mcs_document_links_insert on public.mcs_document_links for insert to authenticated
 with check(family_id in(select family_id from public.mcs_members where user_id=(select auth.uid()))
 and exists(select 1 from public.mcs_documents d where d.id=document_id and d.child_id=mcs_document_links.child_id and d.family_id=mcs_document_links.family_id)
 and exists(select 1 from public.mcs_tasks t where t.id=task_id and t.child_id=mcs_document_links.child_id and t.family_id=mcs_document_links.family_id));
insert into public.mcs_document_links(family_id,child_id,document_id,task_id)
 select d.family_id,d.child_id,d.id,d.task_id from public.mcs_documents d join public.mcs_tasks t on t.id=d.task_id and t.child_id=d.child_id and t.family_id=d.family_id;
grant update(task_id,subject) on public.mcs_documents to authenticated;
create function public.mcs_set_document_links(p_document uuid,p_version integer,p_tasks uuid[],p_subject text)
 returns void language plpgsql security invoker set search_path='' as $$
declare doc public.mcs_documents; changed integer;
begin
 select * into doc from public.mcs_documents where id=p_document;
 if auth.uid() is null or doc.id is null then raise exception 'Document unavailable'; end if;
 if p_tasks is null or cardinality(p_tasks)>100 or length(p_subject)>80 then raise exception 'Invalid selection'; end if;
 if exists(select 1 from unnest(p_tasks) x where x is null or not exists(select 1 from public.mcs_tasks t where t.id=x and t.child_id=doc.child_id and t.family_id=doc.family_id)) then raise exception 'Task belongs to another child'; end if;
 update public.mcs_documents set task_id=p_tasks[1],subject=p_subject,version=version+1 where id=doc.id and version=p_version;
 get diagnostics changed=row_count;if changed<>1 then raise exception 'Document changed: reload'; end if;
 delete from public.mcs_document_links where document_id=doc.id;
 insert into public.mcs_document_links(family_id,child_id,document_id,task_id)
 select doc.family_id,doc.child_id,doc.id,x from (select distinct unnest(p_tasks) x) selected;
end $$;
revoke all on function public.mcs_set_document_links(uuid,integer,uuid[],text) from public,anon;
grant execute on function public.mcs_set_document_links(uuid,integer,uuid[],text) to authenticated;
commit;

