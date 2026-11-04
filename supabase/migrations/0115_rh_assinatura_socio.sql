-- Assinatura do sócio impressa na declaração do banco, a pedido dele (04/11/2026). A imagem fica só aqui no banco, fora do
-- repositório e fora das imagens públicas do portal: só Admin e RH leem.
create table public.rh_assinatura_socio (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  imagem text not null check (imagem like 'data:image/png;base64,%'),
  atualizado_em timestamptz not null default now()
);
alter table public.rh_assinatura_socio enable row level security;
create policy rh_assinatura_socio_sel on public.rh_assinatura_socio for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('rh')));
