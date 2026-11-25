-- Vendas por coordenador (pedido do Luiz, 25/11/2026): o coordenador vê a REDE (só o total, sem filial nenhuma) e a
-- regional dele (Sul, Serra ou Oeste, pela regional do cadastro), filial por filial; as filiais das outras regionais não
-- aparecem mais. Antes ele lia todas as filiais em todas as tabelas de vendas e do CRM. Só troca regras e cria funções.

-- filiais da regional do coordenador logado (vazio para os outros papéis)
create or replace function private.filiais_da_coordenacao()
returns uuid[]
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce(array_agg(b.id), '{}'::uuid[])
    from public.branches b
    join public.profiles p on p.id = auth.uid()
   where p.ativo and p.papel = 'coordenador' and p.regional is not null and b.regional = p.regional;
$$;
revoke all on function private.filiais_da_coordenacao() from public, anon;
grant execute on function private.filiais_da_coordenacao() to authenticated;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('vendas_filial_dia', 'vfd_sel'), ('vendas_grupo_dia', 'vgd_sel'), ('vendas_laboratorio_dia', 'vld_sel'),
    ('vendas_tele_filial_dia', 'vtf_sel'), ('vendas_vendedor_dia', 'vvd_sel'), ('vendas_vendedor_grupo_mes', 'vvgm_sel'),
    ('crm_fidelizacao_dia', 'crm_dia_sel')) as x(tabela, politica)
  loop
    execute format(
      'alter policy %I on public.%I using ((select private.sou_admin()) or (select private.tem_papel(''financeiro''))'
      ' or branch_id = any ((select private.filiais_da_coordenacao())::uuid[])'
      ' or ((select private.tem_papel(''gerente'')) and branch_id = any ((select private.filiais_visiveis())::uuid[])))',
      t.politica, t.tabela);
  end loop;
end $$;

-- metas: o coordenador vê as metas das filiais da regional dele
alter policy vmeta_sel on public.vendas_metas using (
  (select private.sou_admin()) or (select private.tem_papel('financeiro'))
  or (alvo = 'filial' and branch_id = any ((select private.filiais_da_coordenacao())::uuid[]))
  or (alvo = 'filial' and (select private.tem_papel('gerente')) and private.pode_ver_filial(branch_id))
);

-- total da REDE para o painel do coordenador: uma linha só, sem filial (as regras das tabelas não valem aqui; quem pode
-- é admin, financeiro e coordenador). Mesmas colunas de vendas_filiais / vendas_serie.
create or replace function public.vendas_rede_resumo(p_de date, p_ate date)
returns table (branch_id uuid, codigo text, nome text, regional text, venda numeric, atendimentos bigint, itens bigint, unidades numeric,
               dias bigint, venda_grupos numeric, custo numeric, premium numeric, generico numeric, similares numeric, referencia numeric, fortvigor numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select null::uuid, 'REDE', 'Rede', 'Rede', sum(f.venda), sum(f.atendimentos)::bigint, sum(f.itens)::bigint, sum(f.unidades), max(f.dias)::bigint,
         sum(f.venda_grupos), sum(f.custo), sum(f.premium), sum(f.generico), sum(f.similares), sum(f.referencia), sum(f.fortvigor)
    from public.vendas_filiais(p_de, p_ate) f
   where f.regional in ('Sul', 'Serra', 'Oeste', 'Televendas')
     and ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')))
  having count(*) > 0
$$;
revoke all on function public.vendas_rede_resumo(date, date) from public, anon;
grant execute on function public.vendas_rede_resumo(date, date) to authenticated;

create or replace function public.vendas_serie_rede(p_de date, p_ate date, p_por text default 'dia')
returns table (periodo date, regional text, venda numeric, atendimentos bigint, unidades numeric, venda_grupos numeric, custo numeric,
               premium numeric, generico numeric, similares numeric, referencia numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select s.periodo, 'Rede', sum(s.venda), sum(s.atendimentos)::bigint, sum(s.unidades), sum(s.venda_grupos), sum(s.custo),
         sum(s.premium), sum(s.generico), sum(s.similares), sum(s.referencia)
    from public.vendas_serie(p_de, p_ate, p_por) s
   where s.regional in ('Sul', 'Serra', 'Oeste', 'Televendas')
     and ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')))
   group by s.periodo
   order by s.periodo
$$;
revoke all on function public.vendas_serie_rede(date, date, text) from public, anon;
grant execute on function public.vendas_serie_rede(date, date, text) to authenticated;
