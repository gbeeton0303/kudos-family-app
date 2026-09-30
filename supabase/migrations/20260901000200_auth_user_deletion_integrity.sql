-- Make Auth-user deletion reliable without leaving a family/classroom orphaned.
--
-- The original schema used restrictive foreign keys for workspaces.created_by
-- and profile_invites.created_by. Postgres therefore rejected an Auth deletion
-- whenever either row still referenced the user. Creator attribution is useful
-- history, but it must not prevent a user from exercising account deletion.

alter table public.workspaces
  drop constraint if exists workspaces_created_by_fkey;
alter table public.workspaces
  alter column created_by drop not null;
alter table public.workspaces
  add constraint workspaces_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.profile_invites
  drop constraint if exists profile_invites_created_by_fkey;
alter table public.profile_invites
  alter column created_by drop not null;
alter table public.profile_invites
  add constraint profile_invites_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- Earlier child onboarding builds could briefly create a workspace for an
-- anonymous child before invite acceptance. The child-boundary migration
-- removed the invalid manager membership; remove only those now-empty,
-- anonymous-created workspaces so the child's Auth account is deletable.
delete from public.workspaces w
using auth.users u
where w.created_by = u.id
  and u.is_anonymous is true
  and not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = w.id
  );

-- Dashboard-initiated Auth deletion bypasses the delete-account Edge Function.
-- If the deleted user is the last manager, delete the workspace (and its
-- cascading family data) instead of leaving an inaccessible workspace behind.
-- If another manager remains, only the deleted user's membership cascades.
create or replace function public.prepare_auth_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workspaces w
  where exists (
    select 1
    from public.workspace_members own_membership
    where own_membership.workspace_id = w.id
      and own_membership.user_id = old.id
      and own_membership.role in ('parent', 'teacher')
  )
  and not exists (
    select 1
    from public.workspace_members other_manager
    where other_manager.workspace_id = w.id
      and other_manager.user_id <> old.id
      and other_manager.role in ('parent', 'teacher')
  );

  return old;
end;
$$;

revoke all on function public.prepare_auth_user_deletion() from public;

drop trigger if exists before_auth_user_delete_cleanup on auth.users;
create trigger before_auth_user_delete_cleanup
before delete on auth.users
for each row execute function public.prepare_auth_user_deletion();
