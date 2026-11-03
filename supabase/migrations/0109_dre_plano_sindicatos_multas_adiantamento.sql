-- Correção da DRE (pedido do Luiz em 03/11/2026, conferindo com o pivot do Omie): categorias que faltavam no plano.
-- Taxas Sindicatos → Outros Tributos; Multas de Mora (2.05.02) → Despesas Financeiras; Adiantamento (2.03.02) → Despesas com Pessoal.
insert into public.dre_plano_contas (categoria, linha) values
  ('taxas sindicatos', 'outras_despesas'),
  ('multas de mora', 'despesas_financeiras'),
  ('adiantamento', 'despesas_pessoal')
on conflict do nothing;
