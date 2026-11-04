-- O painel da conciliação tira das listas o que já foi enviado ao Omie. A marca fica em conc_enviados_omie, por chave, e são
-- milhares: cruzar as tabelas a cada tela levava segundos. Por isso o item guarda a data do envio, mantida por gatilho, e os
-- índices parciais deixam a lista e os números das abas rápidos.
drop function if exists public.conc_contagem_abas(uuid);
drop view if exists public.conc_itens_envio;

alter table public.conc_itens add column if not exists enviado_em timestamptz;

update public.conc_itens i
   set enviado_em = e.enviado_em
  from public.conc_enviados_omie e
 where e.chave = i.chave and e.desfeito_em is null and i.enviado_em is distinct from e.enviado_em;

-- Enviou, desfez ou apagou o envio: acompanha em todas as conciliações que têm a mesma conta.
create or replace function private.conc_itens_marcar_envio() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_data timestamptz;
begin
  if tg_op = 'DELETE' then
    update public.conc_itens set enviado_em = null where chave = old.chave and enviado_em is not null;
    return old;
  end if;
  v_data := case when new.desfeito_em is null then new.enviado_em end;
  update public.conc_itens set enviado_em = v_data where chave = new.chave and enviado_em is distinct from v_data;
  return new;
end $$;
revoke all on function private.conc_itens_marcar_envio() from public, anon, authenticated;

drop trigger if exists conc_enviados_marca_item on public.conc_enviados_omie;
create trigger conc_enviados_marca_item
  after insert or delete or update of enviado_em, desfeito_em on public.conc_enviados_omie
  for each row execute function private.conc_itens_marcar_envio();

-- Conciliação nova com conta já enviada em outra: nasce marcada.
create or replace function private.conc_itens_envio_ao_criar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select e.enviado_em into new.enviado_em from public.conc_enviados_omie e where e.chave = new.chave and e.desfeito_em is null;
  return new;
end $$;
revoke all on function private.conc_itens_envio_ao_criar() from public, anon, authenticated;

drop trigger if exists conc_itens_envio_ao_criar on public.conc_itens;
create trigger conc_itens_envio_ao_criar
  before insert on public.conc_itens
  for each row execute function private.conc_itens_envio_ao_criar();

create index if not exists conc_itens_abertos_idx on public.conc_itens (conciliacao_id, grupo, vencimento, beneficiario) where enviado_em is null;
create index if not exists conc_itens_enviados_idx on public.conc_itens (conciliacao_id, vencimento, beneficiario) where enviado_em is not null;
create index if not exists conc_itens_descontos_idx on public.conc_itens (conciliacao_id, vencimento, beneficiario) where enviado_em is null and desconto is not null;

-- Números das abas (o resumo da conciliação é uma foto de quando ela foi criada e não conhece os envios).
create function public.conc_contagem_abas(p_conciliacao uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'exato', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'exato'),
    'aproximado', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'aproximado'),
    'so_trier', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'so_trier'),
    'so_dda', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'so_dda'),
    'descontos', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and desconto is not null),
    'enviados', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is not null));
$$;
revoke all on function public.conc_contagem_abas(uuid) from public, anon;
grant execute on function public.conc_contagem_abas(uuid) to authenticated;

analyze public.conc_itens;
