-- Lançamentos da folha: o gerente passa a VER os lançamentos das filiais dele, sem editar (pedido do Luiz em 05/11/2026).
-- Só leitura: as políticas de gravação continuam só de admin e RH. A observação do mês, os códigos da Domínio e a planilha
-- da contabilidade seguem só com admin e RH. Nada é apagado nem alterado.
drop policy if exists flanc_sel on public.folha_lancamentos;
create policy flanc_sel on public.folha_lancamentos for select to authenticated
  using ((select private.sou_admin())
      or (select private.tem_papel('rh'))
      or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));

-- o nome das colunas da tela (hora extra, quebra de caixa...); não tem valor de ninguém
drop policy if exists fev_sel on public.folha_eventos;
create policy fev_sel on public.folha_eventos for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('rh', 'gerente')));
