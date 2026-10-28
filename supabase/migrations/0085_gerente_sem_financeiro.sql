-- Gerente não vê nada do financeiro (decisão de 28/10/2026): só o painel de vendas da própria loja.
-- Tira o gerente da leitura das tabelas fin_* (antes saldos, ajustes, fluxo, orçamento e inadimplência
-- liam todas as lojas). Coordenador continua como estava.

alter policy flan_sel on public.fin_lancamentos using (
  (select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))
  or ((select private.tem_papel('coordenador')) and branch_id = any ((select private.filiais_visiveis())::uuid[]))
);
alter policy faj_sel on public.fin_dre_ajustes using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'coordenador')));
alter policy fajl_sel on public.fin_dre_ajustes_linhas using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'coordenador')));
alter policy fsal_sel on public.fin_dre_saldos using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'coordenador')));
alter policy ffd_sel on public.fin_fluxo_diario using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'coordenador')) or (select private.fluxo_pode_ver()));
alter policy ffm_sel on public.fin_fluxo_mensal using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'coordenador')));
alter policy fina_sel on public.fin_inadimplencia using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'coordenador')));
alter policy forc_sel on public.fin_orcamentos using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'coordenador')));
