begin;
-- Legacy prototype tables remain intact for administrators, with no browser API access.
revoke all on public.families,public.family_members,public.homework,public.study_sessions,public.quiz_results from public,anon,authenticated;
revoke all on function public.add_family_owner(),public.can_read_child(uuid,uuid),public.is_family_parent(uuid) from public,anon,authenticated;
-- Administrative-only family root: explicit deny makes intent clear.
create policy mcs_families_closed on public.mcs_families for all to anon,authenticated using(false) with check(false);
-- Cover foreign keys used by current and retained schemas.
create index mcs_tasks_child_family on public.mcs_tasks(child_id,family_id);
create index mcs_cards_child_family on public.mcs_cards(child_id,family_id);
create index families_owner_idx on public.families(owner_id);
create index family_members_user_idx on public.family_members(user_id);
create index homework_child_family_idx on public.homework(child_id,family_id);
create index homework_family_idx on public.homework(family_id);
create index quiz_results_child_family_idx on public.quiz_results(child_id,family_id);
create index quiz_results_family_idx on public.quiz_results(family_id);
create index study_sessions_child_family_idx on public.study_sessions(child_id,family_id);
create index study_sessions_family_idx on public.study_sessions(family_id);
create index study_sessions_homework_idx on public.study_sessions(homework_id);
commit;
