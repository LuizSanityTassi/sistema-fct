-- Escalas 5x2: quantidade de pendências da opção, para as listas não precisarem ler a escala inteira.
alter table public.esc_simulacoes
  add column if not exists qtd_alertas integer generated always as (jsonb_array_length(alertas)) stored;
