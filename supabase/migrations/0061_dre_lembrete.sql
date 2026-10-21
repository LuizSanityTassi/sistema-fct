-- Lembrete no sino da DRE do contador (pedido do usuário, 21/10/2026): a partir do dia combinado, se a DRE do mês
-- anterior ainda não foi importada para uma empresa, a central de pendências avisa admin, financeiro e contador.
-- Configuração em sistema_config 'dre_lembrete' {ligado, dia}; padrão ligado a partir do dia 15.

insert into public.sistema_config (chave, valor, atualizado_em)
values ('dre_lembrete', '{"ligado": true, "dia": 15}', now())
on conflict (chave) do nothing;

-- o contador também importa a DRE: lê só esta chave (para o lembrete aparecer no sino dele); mudar continua
-- sendo de admin/financeiro (scfg_ins/scfg_upd)
alter policy scfg_sel on public.sistema_config using (
  (select private.sou_admin())
  or (select private.tem_papel('financeiro'))
  or (chave = 'dre_lembrete' and (select private.tem_papel('contador')))
);
