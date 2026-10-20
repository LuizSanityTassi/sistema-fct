-- DRE contábil por filial (a planilha "DRE POR FILIAIS" do contador). Guarda só os lançamentos de cada conta por
-- filial × mês; as contas calculadas (receita líquida, margem, lucro, %) ficam no sistema. A depreciação fica como
-- valor da empresa (branch_id nulo): entra no consolidado e não no resultado da filial — como na planilha.
-- Cada importação substitui os meses que vieram no arquivo, daquela empresa (o mês reenviado é o mês corrigido).
-- Só Administrador, Financeiro e Contador veem e importam. Aditiva: tabelas novas.

create table if not exists public.dre_contabil_importacoes (
  id              uuid primary key default gen_random_uuid(),
  empresa         text not null check (char_length(empresa) between 1 and 60),
  arquivo         text,
  meses           date[] not null,
  filiais         integer not null default 0,
  valores         integer not null default 0,
  avisos          jsonb,
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  criado_em       timestamptz not null default now()
);

create table if not exists public.dre_contabil (
  id            uuid primary key default gen_random_uuid(),
  empresa       text not null,
  branch_id     uuid references public.branches (id) on delete restrict,
  competencia   date not null check (extract(day from competencia) = 1),
  linha         text not null check (linha in (
                  'vendas', 'outras_receitas_brutas', 'devolucoes', 'impostos_vendas', 'comissoes', 'custo_mercadoria',
                  'ajuste_cmv', 'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais', 'outras_despesas',
                  'depreciacao', 'receita_financeira', 'outras_receitas', 'despesas_financeiras', 'ir_csll')),
  valor         numeric(14, 2) not null,
  importacao_id uuid not null references public.dre_contabil_importacoes (id) on delete cascade
);
create unique index if not exists dre_contabil_unico on public.dre_contabil (empresa, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia, linha);
create index if not exists dre_contabil_mes_idx on public.dre_contabil (empresa, competencia);

create or replace function private.dre_importacao_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  new.criado_por := auth.uid();
  new.criado_por_nome := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
  new.criado_em := now();
  return new;
end;
$$;
revoke all on function private.dre_importacao_carimbar() from public, anon;
drop trigger if exists dre_importacao_carimbar on public.dre_contabil_importacoes;
create trigger dre_importacao_carimbar before insert on public.dre_contabil_importacoes
  for each row execute function private.dre_importacao_carimbar();

alter table public.dre_contabil_importacoes enable row level security;
alter table public.dre_contabil enable row level security;
create policy dreimp_sel on public.dre_contabil_importacoes for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy dreimp_ins on public.dre_contabil_importacoes for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy dre_sel on public.dre_contabil for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy dre_ins on public.dre_contabil for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy dre_del on public.dre_contabil for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));

-- importação de uma vez (tudo ou nada): registra, apaga os meses do arquivo daquela empresa e grava os novos valores.
-- security invoker: quem chama precisa das permissões acima.
create or replace function public.dre_contabil_importar(p_empresa text, p_arquivo text, p_meses date[], p_valores jsonb, p_avisos jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_filiais integer;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))) then
    raise exception 'Só Administrador, Financeiro e Contador importam a DRE.';
  end if;
  if coalesce(array_length(p_meses, 1), 0) = 0 then raise exception 'Nenhum mês para importar.'; end if;
  select count(distinct v ->> 'branch_id') into v_filiais from jsonb_array_elements(p_valores) v where v ->> 'branch_id' is not null;
  insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
  values (p_empresa, p_arquivo, p_meses, v_filiais, jsonb_array_length(p_valores), p_avisos)
  returning id into v_id;
  delete from public.dre_contabil where empresa = p_empresa and competencia = any (p_meses);
  insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id)
  select p_empresa, nullif(v ->> 'branch_id', '')::uuid, (v ->> 'competencia')::date, v ->> 'linha', (v ->> 'valor')::numeric, v_id
    from jsonb_array_elements(p_valores) v
   where (v ->> 'competencia')::date = any (p_meses);
  return v_id;
end;
$$;
revoke all on function public.dre_contabil_importar(text, text, date[], jsonb, jsonb) from public, anon;
grant execute on function public.dre_contabil_importar(text, text, date[], jsonb, jsonb) to authenticated;
