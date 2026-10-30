-- Metas de venda do mês (pedido do Luiz em 30/10/2026: "aba para cadastrar meta por filial, por vendedor, tanto nas
-- filiais tanto no televendas"). Uma linha por mês e alvo:
--   chave 'filial:<branch_id>'  → meta da filial (venda sem o televendas, como no ranking das lojas)
--   chave 'televendas'          → meta do televendas como loja
--   chave 'vendedor:<código>'   → meta do vendedor (código do Trier), somando todas as filiais; do tele sem e-commerce
create table public.vendas_metas (
  id uuid primary key default gen_random_uuid(),
  mes date not null check (extract(day from mes) = 1),
  alvo text not null check (alvo in ('filial', 'televendas', 'vendedor')),
  branch_id uuid references public.branches (id) on delete cascade,
  vendedor_codigo integer,
  chave text not null,
  valor numeric not null check (valor >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null,
  unique (mes, chave),
  check ((alvo = 'filial' and branch_id is not null and chave = 'filial:' || branch_id::text)
      or (alvo = 'televendas' and chave = 'televendas')
      or (alvo = 'vendedor' and vendedor_codigo is not null and chave = 'vendedor:' || vendedor_codigo::text))
);
create index vendas_metas_branch_idx on public.vendas_metas (branch_id);

alter table public.vendas_metas enable row level security;
-- vê: admin, financeiro e coordenador tudo; gerente a meta das lojas dele
create policy vmeta_sel on public.vendas_metas for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador'))
    or (alvo = 'filial' and (select private.tem_papel('gerente')) and private.pode_ver_filial(branch_id)));
-- cadastra: admin e financeiro
create policy vmeta_ins on public.vendas_metas for insert to authenticated with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy vmeta_upd on public.vendas_metas for update to authenticated using ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy vmeta_del on public.vendas_metas for delete to authenticated using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

-- Venda de cada vendedor no período (todas as filiais) e a filial onde mais vendeu; do televendas, sem o e-commerce.
create or replace function public.vendas_vendedores_periodo(p_de date, p_ate date)
returns table (vendedor_codigo integer, vendedor_nome text, branch_id uuid, codigo text, loja text, regional text, televendas boolean, venda numeric, atendimentos bigint)
language sql
stable
set search_path = ''
as $$
  with v as (
    select d.vendedor_codigo, d.branch_id, max(d.vendedor_nome) nome,
      sum(d.venda - case when t.vendedor_codigo is not null then d.ecom_venda else 0 end) venda,
      sum(d.atendimentos - case when t.vendedor_codigo is not null then d.ecom_atendimentos else 0 end) atendimentos,
      bool_or(t.vendedor_codigo is not null) tele
    from public.vendas_vendedor_dia d
    left join public.vendas_televendas_vendedores t on t.vendedor_codigo = d.vendedor_codigo
    where d.data between p_de and p_ate
    group by d.vendedor_codigo, d.branch_id
  ), principal as (
    select distinct on (v.vendedor_codigo) v.vendedor_codigo, v.branch_id from v order by v.vendedor_codigo, v.venda desc
  )
  select v.vendedor_codigo, max(v.nome), p.branch_id, b.codigo, b.nome, b.regional, bool_or(v.tele), sum(v.venda), sum(v.atendimentos)::bigint
  from v
  join principal p on p.vendedor_codigo = v.vendedor_codigo
  join public.branches b on b.id = p.branch_id
  group by v.vendedor_codigo, p.branch_id, b.codigo, b.nome, b.regional;
$$;
revoke execute on function public.vendas_vendedores_periodo(date, date) from public, anon;
grant execute on function public.vendas_vendedores_periodo(date, date) to authenticated;
