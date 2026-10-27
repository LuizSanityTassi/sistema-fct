-- 0077 — Quem recebeu o Fluxo de caixa compartilhado também lê a foto do dia (conferência de caixa, o que entrou e
-- saldos das contas, que são os mesmos da tela Caixa). Gravar continua só com Administrador e Financeiro.
alter policy ffd_sel on public.fin_fluxo_diario
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador')) or (select private.fluxo_pode_ver()));
