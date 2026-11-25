-- Escala: afastamento com data de início e de fim na pessoa da equipe (pedido do Luiz, 25/11/2026). Com as datas, a pessoa
-- fica fora da escala só nesses dias e volta sozinha no dia seguinte ao fim: o simulador já calcula as folgas e os turnos a
-- partir do retorno. Afastado sem datas continua como antes (fora do período inteiro). Só acrescenta colunas.
alter table public.esc_colaboradores add column if not exists afastado_de date;
alter table public.esc_colaboradores add column if not exists afastado_ate date;
alter table public.esc_colaboradores drop constraint if exists esc_colaboradores_afastamento_ck;
alter table public.esc_colaboradores add constraint esc_colaboradores_afastamento_ck
  check (afastado_de is null or afastado_ate is null or afastado_ate >= afastado_de);
