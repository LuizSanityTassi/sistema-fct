-- Auditoria de 06/11/2026 — grupo 2 (Omie, regra absoluta: nunca duplicar).
-- 1) conc_enviados_omie ganha o código de barras (44 dígitos) e o banco passa a RECUSAR o mesmo boleto ativo duas vezes,
--    qualquer que seja a filial, a empresa ou a conciliação (antes a trava era só pela chave boleto+filial).
-- 2) Reserva antes de chamar o Omie: dois envios ao mesmo tempo (duas abas, dois usuários, planilha e API) não pegam a
--    mesma conta nem o mesmo boleto. A reserva vence sozinha em 15 minutos (se a função morrer no meio).

alter table public.conc_enviados_omie add column if not exists barra text;

-- preenche os já enviados com o código de barras do item da conciliação (todos têm 44 dígitos hoje)
update public.conc_enviados_omie e
   set barra = x.barra
  from (select distinct on (i.chave) i.chave, regexp_replace(i.barra, '\D', '', 'g') as barra
          from public.conc_itens i
         where coalesce(i.barra, '') <> ''
         order by i.chave, i.id desc) x
 where x.chave = e.chave and e.barra is null;

create unique index if not exists conc_enviados_omie_barra_ativa
  on public.conc_enviados_omie (barra)
  where desfeito_em is null and barra is not null;

-- ---------- reservas ----------
create table if not exists public.conc_envio_reservas (
  id text primary key,                       -- 'c:<chave>' ou 'b:<código de barras>'
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null
);
alter table public.conc_envio_reservas enable row level security;
revoke all on public.conc_envio_reservas from anon;
grant select, insert, delete on public.conc_envio_reservas to authenticated;
drop policy if exists cres_sel on public.conc_envio_reservas;
drop policy if exists cres_ins on public.conc_envio_reservas;
drop policy if exists cres_del on public.conc_envio_reservas;
create policy cres_sel on public.conc_envio_reservas for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy cres_ins on public.conc_envio_reservas for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy cres_del on public.conc_envio_reservas for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

-- Reserva o que der; devolve só os ids que ficaram com quem chamou (os outros estão num envio em andamento).
create or replace function public.conc_reservar_envio(p_ids text[])
returns text[] language plpgsql security invoker set search_path = public as $$
declare
  v text[];
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) then
    raise exception 'Só Administrador e Financeiro enviam ao Omie.' using errcode = 'P0001';
  end if;
  delete from public.conc_envio_reservas where criado_em < now() - interval '15 minutes';
  with novos as (
    insert into public.conc_envio_reservas (id, criado_por)
    select distinct unnest(p_ids), auth.uid()
    on conflict (id) do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into v from novos;
  return v;
end;
$$;
revoke all on function public.conc_reservar_envio(text[]) from public, anon;
grant execute on function public.conc_reservar_envio(text[]) to authenticated;

create or replace function public.conc_liberar_envio(p_ids text[])
returns void language sql security invoker set search_path = public as $$
  delete from public.conc_envio_reservas where id = any (p_ids) and (criado_por = auth.uid() or criado_por is null);
$$;
revoke all on function public.conc_liberar_envio(text[]) from public, anon;
grant execute on function public.conc_liberar_envio(text[]) to authenticated;
