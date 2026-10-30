-- DRE: a categoria "Premiação" do Omie vai para (−) Comissões s/ vendas (pedido de 30/10/2026). Refaz setembro.
alter table public.dre_plano_contas drop constraint if exists dre_plano_contas_linha_check;
alter table public.dre_plano_contas add constraint dre_plano_contas_linha_check
  check (linha in ('devolucoes', 'comissoes', 'outras_receitas', 'receita_financeira', 'despesas_pessoal', 'despesas_administrativas',
                   'despesas_comerciais', 'outras_despesas', 'despesas_financeiras'));
insert into public.dre_plano_contas (categoria, linha) values ('premiação', 'comissoes')
on conflict (categoria) do update set linha = excluded.linha;

select public.dre_contabil_preencher_omie(date '2026-09-01');
