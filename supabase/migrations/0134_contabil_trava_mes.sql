-- 10/11/2026 (pedido do Luiz): o contador trava o mês que passou e libera quando precisar.
-- Com o mês travado, NADA da parte contábil daquele mês muda — nem pela tela, nem por importação, nem pelo robô, nem
-- pelo administrador: DRE contábil (valores, lançamentos à mão, rateios), caixa contábil (ajustes, linhas, saldos) e os
-- lançamentos do financeiro do mês (a base do caixa contábil). Quem precisar mudar pede para liberar; travar e liberar
-- ficam com o contador e o administrador e vão para a auditoria.

create table if not exists public.contabil_meses_travados (
  competencia date primary key check (extract(day from competencia) = 1),
  travado_por uuid references auth.users (id) on delete set null,
  travado_por_nome text,
  travado_em timestamptz not null default now()
);
alter table public.contabil_meses_travados enable row level security;
revoke all on public.contabil_meses_travados from anon;
grant select, insert, delete on public.contabil_meses_travados to authenticated;
drop policy if exists ctrav_sel on public.contabil_meses_travados;
drop policy if exists ctrav_ins on public.contabil_meses_travados;
drop policy if exists ctrav_del on public.contabil_meses_travados;
create policy ctrav_sel on public.contabil_meses_travados for select to authenticated using (true);
create policy ctrav_ins on public.contabil_meses_travados for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('contador')));
create policy ctrav_del on public.contabil_meses_travados for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('contador')));

-- A trava das tabelas contábeis: a competência da linha (antes e depois da mudança) não pode estar travada.
-- Serve para "competencia" em data (aaaa-mm-01) ou texto (aaaa-mm).
create or replace function private.contabil_trava_checar()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare
  v text;
  m date;
begin
  foreach v in array array[
    case when tg_op <> 'INSERT' then to_jsonb(old) ->> 'competencia' end,
    case when tg_op <> 'DELETE' then to_jsonb(new) ->> 'competencia' end
  ] loop
    continue when v is null or trim(v) = '';
    m := date_trunc('month', (case when length(trim(v)) = 7 then trim(v) || '-01' else left(trim(v), 10) end)::date)::date;
    if exists (select 1 from public.contabil_meses_travados t where t.competencia = m) then
      raise exception 'O mês % está travado pelo contador: a parte contábil desse mês não pode mudar. Para alterar, peça para liberar a trava (Financeiro → DRE).', to_char(m, 'MM/YYYY')
        using errcode = 'P0001';
    end if;
  end loop;
  return coalesce(new, old);
end $$;
revoke all on function private.contabil_trava_checar() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['dre_contabil', 'dre_contabil_rateios', 'fin_dre_ajustes', 'fin_dre_ajustes_linhas', 'fin_dre_saldos'] loop
    execute format('drop trigger if exists t_contabil_trava on public.%I', t);
    execute format('create trigger t_contabil_trava before insert or update or delete on public.%I for each row execute function private.contabil_trava_checar()', t);
  end loop;
end $$;

-- Lançamentos do financeiro (base do caixa contábil): além do "mês fechado" do financeiro (que o administrador
-- atravessa), o mês travado pelo contador barra todo mundo.
create or replace function public.fin_lancamento_antes()
returns trigger language plpgsql security definer set search_path to 'public', 'private' as $function$
declare comp char(7);
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.competencia := to_char(new.data, 'YYYY-MM');
  end if;
  comp := to_char(coalesce(new.data, old.data), 'YYYY-MM');
  if exists (select 1 from public.contabil_meses_travados t where t.competencia = (comp || '-01')::date)
     or (tg_op = 'UPDATE' and exists (select 1 from public.contabil_meses_travados t where t.competencia = (old.competencia || '-01')::date)) then
    raise exception 'O mês % está travado pelo contador. Peça ao contador (ou ao administrador) para liberar a trava.', comp using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fin_meses_fechados m where m.competencia = comp) and not private.sou_admin() then
    raise exception 'Competência % fechada. Peça ao administrador para reabrir.', comp using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.competencia <> comp
     and exists (select 1 from public.fin_meses_fechados m where m.competencia = old.competencia)
     and not private.sou_admin() then
    raise exception 'Lançamento pertence a competência fechada.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $function$;
