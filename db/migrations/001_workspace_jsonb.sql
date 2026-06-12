create table if not exists workspaces (
  id text primary key,
  organization_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_organization_idx on workspaces (organization_id);

create index if not exists workspaces_subscription_idx on workspaces using gin ((data -> 'subscriptions'));
