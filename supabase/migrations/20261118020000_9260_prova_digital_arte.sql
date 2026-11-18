-- manifest: Prova digital de arte/layout para aprovação do cliente (WhatsApp ou Link Web). Permite envio de prévias (JPG/PNG/PDF), registro formal de aceite com IP/User-Agent e movimentação automática do funil para Em Produção.

create table if not exists public.arte_provas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  token text not null unique,
  os_number text,
  titulo text not null,
  file_url text not null,
  file_name text not null,
  file_mime text not null default 'application/octet-stream',
  file_size_bytes bigint default 0,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada', 'cancelada')),
  decided_at timestamptz,
  decided_via text check (decided_via is null or decided_via in ('link', 'whatsapp')),
  rejection_reason text,
  client_ip text,
  client_user_agent text,
  checklist_agreed boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_arte_provas_token on public.arte_provas(token);
create index if not exists idx_arte_provas_org_status on public.arte_provas(organization_id, status);
create index if not exists idx_arte_provas_conversation on public.arte_provas(organization_id, conversation_id);
create index if not exists idx_arte_provas_contact on public.arte_provas(organization_id, contact_id);

alter table public.arte_provas enable row level security;

drop policy if exists tenant_isolation_arte_provas_all on public.arte_provas;
create policy tenant_isolation_arte_provas_all on public.arte_provas
  for all to authenticated
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

revoke all on table public.arte_provas from public, anon;
grant select, insert, update, delete on table public.arte_provas to authenticated;
grant all on table public.arte_provas to service_role;
