-- Coordenador sem o Financeiro (decisão do Luiz, 24/11/2026): sai de Visão geral, Lançamentos, Caixa contábil,
-- Orçamento, Caixa e Inadimplência. Além do menu, o banco deixa de entregar esses números a ele (como foi feito com o
-- gerente na 0085). Só troca a regra de leitura das políticas; nenhum dado muda.
alter policy flan_sel on public.fin_lancamentos
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
alter policy faj_sel on public.fin_dre_ajustes
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
alter policy fajl_sel on public.fin_dre_ajustes_linhas
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
alter policy fsal_sel on public.fin_dre_saldos
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
alter policy ffd_sel on public.fin_fluxo_diario
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')) or (select private.fluxo_pode_ver()));
alter policy ffm_sel on public.fin_fluxo_mensal
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
alter policy fina_sel on public.fin_inadimplencia
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
alter policy forc_sel on public.fin_orcamentos
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
