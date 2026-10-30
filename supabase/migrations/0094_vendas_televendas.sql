-- Televendas: a equipe de tele-vendas (código do vendedor no Trier) vira uma "loja" à parte nas telas de vendas.
-- A venda deles continua dentro da filial onde o Trier lançou; a linha Televendas soma o que esses vendedores
-- venderam em qualquer filial (vendas_vendedor_dia, relatório Rel_0028 por vendedor).
create table public.vendas_televendas_vendedores (
  vendedor_codigo integer primary key,
  nome text not null,
  equipe text not null,
  funcao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

alter table public.vendas_televendas_vendedores enable row level security;

create policy vtel_sel on public.vendas_televendas_vendedores for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')));
create policy vtel_ins on public.vendas_televendas_vendedores for insert to authenticated with check ((select private.sou_admin()));
create policy vtel_upd on public.vendas_televendas_vendedores for update to authenticated using ((select private.sou_admin())) with check ((select private.sou_admin()));
create policy vtel_del on public.vendas_televendas_vendedores for delete to authenticated using ((select private.sou_admin()));

-- equipe passada pelo Luiz em 30/10/2026
insert into public.vendas_televendas_vendedores (vendedor_codigo, nome, equipe, funcao) values
  (56562, 'ARTUR DA SILVA VIEIRA', 'Coordenação', 'Coordenador de tele-vendas'),
  (56698, 'ISABEL FELISBINO ROCHA', 'Criciúma', 'Vendedora de tele-vendas'),
  (56843, 'JESSICA APARECIDA RAMOS', 'Criciúma', 'Vendedora de tele-vendas'),
  (60385, 'DERIANE MARIA BENELLI', 'Concórdia', 'Vendedora de tele-vendas'),
  (56345, 'SHEILA HIRT JACOVACS', 'Concórdia', 'Vendedora de tele-vendas'),
  (2582, 'PRISCILA SVOBODA', 'Lages', 'Vendedora de tele-vendas');

-- venda da equipe no período, por vendedor × filial onde a venda caiu (a RLS das tabelas vale: security invoker)
create or replace function public.vendas_televendas(p_de date, p_ate date)
returns table (
  vendedor_codigo integer, vendedor_nome text, equipe text, funcao text,
  branch_id uuid, codigo text, loja text, regional text,
  venda numeric, atendimentos bigint, custo numeric, tele_venda numeric, tele_atendimentos bigint, dias bigint
)
language sql
stable
set search_path = ''
as $$
  select t.vendedor_codigo, t.nome, t.equipe, t.funcao,
    b.id, b.codigo, b.nome, b.regional,
    sum(v.venda), sum(v.atendimentos)::bigint, sum(v.custo), sum(v.tele_venda), sum(v.tele_atendimentos)::bigint, count(distinct v.data)
  from public.vendas_televendas_vendedores t
  join public.vendas_vendedor_dia v on v.vendedor_codigo = t.vendedor_codigo and v.data between p_de and p_ate
  join public.branches b on b.id = v.branch_id
  group by t.vendedor_codigo, t.nome, t.equipe, t.funcao, b.id, b.codigo, b.nome, b.regional;
$$;

revoke execute on function public.vendas_televendas(date, date) from public, anon;
grant execute on function public.vendas_televendas(date, date) to authenticated;
