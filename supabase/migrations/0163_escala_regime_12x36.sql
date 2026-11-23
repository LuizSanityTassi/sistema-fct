-- Escala: regime de cada pessoa. 5x2 (padrão: cinco dias e duas folgas na semana) ou 12x36 (um dia sim, um dia não,
-- 12 horas corridas com o intervalo dentro). Só acrescenta a coluna: todo mundo continua 5x2 até o RH marcar.
alter table public.esc_colaboradores add column if not exists regime text not null default '5x2';
alter table public.esc_colaboradores drop constraint if exists esc_colaboradores_regime_check;
alter table public.esc_colaboradores add constraint esc_colaboradores_regime_check check (regime in ('5x2', '12x36'));
