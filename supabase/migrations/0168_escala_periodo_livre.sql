-- Escala: período escolhido pelo RH (de um dia até outro), além do período da folha (21 a 20). `fim` só existe no
-- período escolhido; nas escalas da folha continua nulo (o fim é o dia 20 da competência). Só acrescenta a coluna.
alter table public.esc_simulacoes add column if not exists fim date;
alter table public.esc_simulacoes drop constraint if exists esc_simulacoes_fim_check;
alter table public.esc_simulacoes add constraint esc_simulacoes_fim_check
  check (fim is null or (inicio is not null and fim >= inicio and fim < (inicio + interval '1 month')::date));
