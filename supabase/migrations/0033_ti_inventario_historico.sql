-- 0033 — Inventário de TI completo: campos de rede/suporte, garantia e histórico de cada equipamento.
-- O sistema registra sozinho cadastro, transferência de loja, troca de situação e de responsável; a TI registra
-- manutenção, troca de peça e o que mais quiser. ADITIVA: colunas novas e uma tabela.

alter table public.it_assets add column if not exists setor        text check (length(setor) <= 60);
alter table public.it_assets add column if not exists hostname     text check (length(hostname) <= 60);
alter table public.it_assets add column if not exists ip           text check (length(ip) <= 45);
alter table public.it_assets add column if not exists anydesk      text check (length(anydesk) <= 30);
alter table public.it_assets add column if not exists garantia_ate date;

create table if not exists public.it_asset_eventos (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references public.it_assets(id) on delete cascade,
  data        date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  tipo        text not null check (tipo in ('cadastro', 'transferencia', 'situacao', 'responsavel', 'manutencao', 'troca_peca', 'outro')),
  descricao   text not null check (length(descricao) between 2 and 1000),
  autor_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  autor_nome  text,
  created_at  timestamptz not null default now()
);
create index if not exists it_asset_eventos_asset_idx on public.it_asset_eventos (asset_id, data desc, created_at desc);

alter table public.it_asset_eventos enable row level security;
revoke all on public.it_asset_eventos from anon;
-- vê o histórico quem vê o equipamento; registra quem mexe no inventário (admin e TI)
create policy itev_sel on public.it_asset_eventos for select to authenticated
  using (exists (select 1 from public.it_assets a where a.id = asset_id and private.pode_ver_filial(a.branch_id)));
create policy itev_ins on public.it_asset_eventos for insert to authenticated with check (private.sou_admin() or private.tem_papel('ti'));
create policy itev_del on public.it_asset_eventos for delete to authenticated using ((private.sou_admin() or private.tem_papel('ti')) and tipo in ('manutencao', 'troca_peca', 'outro'));

-- eventos automáticos
create or replace function private.t_it_asset_eventos()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_autor text := (select nullif(trim(p.nome), '') from public.profiles p where p.id = auth.uid());
  v_de text;
  v_para text;
  rotulo_status constant jsonb := '{"em_uso":"Em uso","estoque":"Em estoque","manutencao":"Em manutenção","baixado":"Baixado"}';
begin
  if tg_op = 'INSERT' then
    select codigo into v_para from public.branches where id = new.branch_id;
    insert into public.it_asset_eventos (asset_id, tipo, descricao, autor_nome) values (new.id, 'cadastro', 'Cadastrado na ' || coalesce(v_para, 'unidade'), v_autor);
    return null;
  end if;
  if new.branch_id is distinct from old.branch_id then
    select codigo into v_de from public.branches where id = old.branch_id;
    select codigo into v_para from public.branches where id = new.branch_id;
    insert into public.it_asset_eventos (asset_id, tipo, descricao, autor_nome) values (new.id, 'transferencia', 'Transferido de ' || coalesce(v_de, '?') || ' para ' || coalesce(v_para, '?'), v_autor);
  end if;
  if new.status is distinct from old.status then
    insert into public.it_asset_eventos (asset_id, tipo, descricao, autor_nome)
    values (new.id, 'situacao', coalesce(rotulo_status ->> old.status::text, old.status::text) || ' → ' || coalesce(rotulo_status ->> new.status::text, new.status::text), v_autor);
  end if;
  if new.responsavel_employee_id is distinct from old.responsavel_employee_id then
    insert into public.it_asset_eventos (asset_id, tipo, descricao, autor_nome)
    values (new.id, 'responsavel', 'Responsável: ' || coalesce((select e.nome from public.employees e where e.id = new.responsavel_employee_id), 'ninguém'), v_autor);
  end if;
  return null;
end;
$$;
revoke all on function private.t_it_asset_eventos() from public, anon, authenticated;
drop trigger if exists t_it_assets_eventos on public.it_assets;
create trigger t_it_assets_eventos after insert or update on public.it_assets for each row execute function private.t_it_asset_eventos();
