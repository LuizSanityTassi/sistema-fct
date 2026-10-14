-- 0016 — Financeiro (Etapa F1): categorias com molde contábil (DRE) e financeiro (fixo/variável),
-- lançamentos realizados por unidade e fechamento de competência. Papel novo: contador.
-- Aditiva: nada existente é alterado ou removido. (papel contador: migração 0015)


create type fin_tipo   as enum ('receber', 'pagar');
create type fin_origem as enum ('manual', 'omie', 'migracao');

create table public.fin_categorias (
  id           uuid primary key default gen_random_uuid(),
  tipo         fin_tipo not null,
  grupo        text not null,              -- grupo operacional (ex.: Despesas Administrativas)
  nome         text not null,
  dre_familia  text,                       -- molde contábil: TOTAL RECEITAS / CUSTO DA MERCADORIA / TOTAL DESPESAS / AJUSTE MANUAL
  dre_grupo    text,                       -- conta do DRE
  dre_sinal    smallint,                   -- +1 receita, -1 custo/despesa
  fin_familia  text,                       -- visão financeira: Custo da Mercadoria / Despesas Fixas / Variáveis / Investimento
  fin_grupo    text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tipo, grupo, nome)
);
create trigger t_fin_cat_upd before update on public.fin_categorias for each row execute function public.set_updated_at();

create table public.fin_lancamentos (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id) on delete restrict,
  tipo          fin_tipo not null,
  categoria_id  uuid not null references public.fin_categorias(id) on delete restrict,
  valor         numeric(14,2) not null check (valor > 0),
  data          date not null,
  competencia   char(7) not null,          -- 'AAAA-MM', mantido por trigger a partir de data
  descricao     text,
  origem        fin_origem not null default 'manual',
  lote_id       uuid,                      -- importação em lote (permite desfazer)
  legado_id     integer,                   -- id no sistema anterior (migração)
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index fin_lanc_branch_data_idx on public.fin_lancamentos (branch_id, data);
create index fin_lanc_competencia_idx on public.fin_lancamentos (competencia);
create index fin_lanc_categoria_idx on public.fin_lancamentos (categoria_id);
create index fin_lanc_lote_idx on public.fin_lancamentos (lote_id);
create unique index fin_lanc_legado_idx on public.fin_lancamentos (legado_id) where legado_id is not null;
create trigger t_fin_lanc_upd before update on public.fin_lancamentos for each row execute function public.set_updated_at();

create table public.fin_meses_fechados (
  competencia  char(7) primary key,
  fechado_por  uuid references public.profiles(id) on delete set null,
  fechado_em   timestamptz not null default now()
);

-- Competência derivada da data + bloqueio de mês fechado (só o administrador altera/reabre).
create or replace function public.fin_lancamento_antes()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare comp char(7);
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.competencia := to_char(new.data, 'YYYY-MM');
  end if;
  comp := to_char(coalesce(new.data, old.data), 'YYYY-MM');
  if exists (select 1 from public.fin_meses_fechados m where m.competencia = comp) and not private.sou_admin() then
    raise exception 'Competência % fechada. Peça ao administrador para reabrir.', comp using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.competencia <> comp
     and exists (select 1 from public.fin_meses_fechados m where m.competencia = old.competencia)
     and not private.sou_admin() then
    raise exception 'Lançamento pertence a competência fechada.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.fin_lancamento_antes() from public, anon, authenticated;
create trigger t_fin_lanc_antes before insert or update or delete on public.fin_lancamentos
  for each row execute function public.fin_lancamento_antes();

-- ---------- RLS ----------
alter table public.fin_categorias     enable row level security;
alter table public.fin_lancamentos    enable row level security;
alter table public.fin_meses_fechados enable row level security;

-- Quem mexe no financeiro: admin, financeiro e contador (contador não exclui nem fecha mês).
create policy fcat_sel on public.fin_categorias for select to authenticated using (true);
create policy fcat_wr  on public.fin_categorias for all to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro', 'contador'))
  with check (private.sou_admin() or private.tem_papel('financeiro', 'contador'));

create policy flan_sel on public.fin_lancamentos for select to authenticated
  using (
    private.sou_admin() or private.tem_papel('financeiro', 'contador')
    or (private.tem_papel('gerente') and private.pode_ver_filial(branch_id))
  );
create policy flan_ins on public.fin_lancamentos for insert to authenticated
  with check (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy flan_upd on public.fin_lancamentos for update to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro', 'contador'))
  with check (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy flan_del on public.fin_lancamentos for delete to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro'));

create policy fmes_sel on public.fin_meses_fechados for select to authenticated using (true);
create policy fmes_wr  on public.fin_meses_fechados for all to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro'))
  with check (private.sou_admin() or private.tem_papel('financeiro'));
