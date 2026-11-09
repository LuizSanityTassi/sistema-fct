-- 0132: o agente dos arquivos do Itaú também registra diagnósticos (arquivo recusado pelo sistema) em
-- integracao_diagnosticos, que até aqui só aceitava sistema = 'trier'. Só alarga a regra; nada é apagado.
alter table public.integracao_diagnosticos drop constraint if exists integracao_diagnosticos_sistema_check;
alter table public.integracao_diagnosticos add constraint integracao_diagnosticos_sistema_check check (sistema in ('trier', 'agente'));
