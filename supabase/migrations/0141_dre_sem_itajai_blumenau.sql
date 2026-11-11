-- 0141 — DRE sem Itajaí (F201–F205, regional Vale do Itajaí, VARELA) e sem Blumenau (F501–F504, regional Blumenau,
-- NAZÁRIO). Pedido do Luiz em 11/11/2026:
--   1) apagar tudo o que essas filiais têm na DRE em setembro e outubro de 2026;
--   2) trava para não entrar mais nada delas na DRE, de nenhuma origem (planilha do contador, "Preencher pelo Omie",
--      robô do Trier, lançamento à mão).
-- A trava ignora a linha dessas filiais e deixa o resto gravar normalmente (o robô e a planilha mandam todas as filiais de
-- uma vez; se desse erro, nenhuma filial seria gravada). Os meses antigos (dez/2025 a ago/2026) ficam como estão.
-- Setembro está travado pelo contador: a trava do mês é desligada só dentro desta transação, para apagar essas filiais.
-- Cópia do que for apagado em private.dre_contabil_bkp_2026_11_itajai_blumenau.

begin;

-- 1) filiais fora da DRE
create table if not exists public.dre_filiais_bloqueadas (
  branch_id uuid primary key references public.branches (id) on delete cascade,
  motivo text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid
);
comment on table public.dre_filiais_bloqueadas is 'Filiais que não entram na DRE contábil: qualquer linha delas gravada em dre_contabil é ignorada (gatilho t_a_filial_bloqueada).';

alter table public.dre_filiais_bloqueadas enable row level security;
drop policy if exists dfb_sel on public.dre_filiais_bloqueadas;
create policy dfb_sel on public.dre_filiais_bloqueadas for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));

insert into public.dre_filiais_bloqueadas (branch_id, motivo)
select b.id, 'Itajaí e Blumenau fora da DRE (pedido do Luiz em 11/11/2026)'
  from public.branches b
 where b.codigo in ('F201', 'F202', 'F203', 'F204', 'F205', 'F501', 'F502', 'F503', 'F504')
on conflict (branch_id) do nothing;

do $$
begin
  if (select count(*) from public.dre_filiais_bloqueadas) <> 9 then
    raise exception 'Esperava 9 filiais bloqueadas (F201–F205 e F501–F504): nada foi feito.';
  end if;
end $$;

-- 2) trava: linha de filial bloqueada não entra (insert) nem muda (update) na DRE
create or replace function private.dre_filial_bloqueada_ignorar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'private', 'public'
as $function$
begin
  if new.branch_id is not null and exists (select 1 from public.dre_filiais_bloqueadas f where f.branch_id = new.branch_id) then
    return null;
  end if;
  return new;
end $function$;

-- o nome começa com "t_a_" para rodar antes dos outros gatilhos da tabela (o Postgres segue a ordem alfabética)
drop trigger if exists t_a_filial_bloqueada on public.dre_contabil;
create trigger t_a_filial_bloqueada
  before insert or update on public.dre_contabil
  for each row execute function private.dre_filial_bloqueada_ignorar();

-- 3) cópia e exclusão de setembro e outubro dessas filiais
create table if not exists private.dre_contabil_bkp_2026_11_itajai_blumenau as
select d.*, now() as copiado_em
  from public.dre_contabil d
 where d.competencia in (date '2026-09-01', date '2026-10-01')
   and d.branch_id in (select branch_id from public.dre_filiais_bloqueadas);

alter table public.dre_contabil disable trigger t_contabil_trava;

with apagadas as (
  delete from public.dre_contabil d
   where d.competencia in (date '2026-09-01', date '2026-10-01')
     and d.branch_id in (select branch_id from public.dre_filiais_bloqueadas)
  returning d.competencia, d.valor
)
insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
select auth.uid(), 'excluir', 'dre_contabil', null,
       jsonb_build_object('competencias', jsonb_agg(distinct a.competencia), 'linhas', count(*), 'soma', round(sum(a.valor), 2)),
       jsonb_build_object('motivo', 'Itajaí (F201–F205) e Blumenau (F501–F504) fora da DRE; cópia em private.dre_contabil_bkp_2026_11_itajai_blumenau')
  from apagadas a;

alter table public.dre_contabil enable trigger t_contabil_trava;

commit;
