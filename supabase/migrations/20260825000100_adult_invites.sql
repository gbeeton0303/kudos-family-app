create table if not exists public.adult_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email text not null,
  code_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint adult_invites_email_not_blank check (length(trim(invited_email)) > 3),
  constraint adult_invites_valid_expiration check (expires_at > created_at)
);

create index if not exists adult_invites_workspace_idx on public.adult_invites(workspace_id);
create index if not exists adult_invites_email_idx on public.adult_invites(lower(invited_email));
create index if not exists adult_invites_active_idx on public.adult_invites(workspace_id, lower(invited_email)) where accepted_at is null and revoked_at is null;

alter table public.adult_invites enable row level security;
revoke all on table public.adult_invites from anon;
revoke all on table public.adult_invites from authenticated;
