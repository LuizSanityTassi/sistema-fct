-- 0074 — Fluxo de caixa da coordenação financeira (diário, semanal e mensal), por empresa (VARELA inclui Itajaí;
-- NAZÁRIO inclui Blumenau), igual à planilha "Resumo diário":
--   • A RECEBER (previsão: dinheiro + PIX + débito) e PREVISÃO DE CARTÃO: digitados pelo financeiro (ou colados da
--     planilha de previsão deles), um valor por empresa × dia;
--   • A PAGAR: soma por dia do relatório do Omie "Contas por Período" (contas a pagar, por data de previsão). Cada
--     importação troca os dias que o relatório cobre; os dias de antes ficam como estavam (histórico);
--   • BALANÇO = a receber − a pagar (calculado na tela);
--   • motivos do dia ("fatores causais") e anotações para a diretoria.
-- A tela pode ser compartilhada com pessoas fora do financeiro (acesso_telas), só para ver ou também para editar.

-- ============================================================================================ acesso por pessoa
-- Tela liberada para uma pessoa além dos papéis do menu (hoje só o Fluxo de caixa usa).
create table public.acesso_telas (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  rota          text not null check (rota ~ '^/[a-z0-9/_-]+$' and length(rota) <= 120),
  pode_editar   boolean not null default false,
  concedido_por uuid references public.profiles(id),
  criado_em     timestamptz not null default now(),
  primary key (user_id, rota)
);

create function private.fluxo_pode_ver() returns boolean
language sql stable security definer set search_path = private, public as $$
  select private.sou_admin() or private.tem_papel('financeiro')
      or exists (select 1 from public.acesso_telas where user_id = auth.uid() and rota = '/financeiro/fluxo-caixa');
$$;
create function private.fluxo_pode_editar() returns boolean
language sql stable security definer set search_path = private, public as $$
  select private.sou_admin() or private.tem_papel('financeiro')
      or exists (select 1 from public.acesso_telas where user_id = auth.uid() and rota = '/financeiro/fluxo-caixa' and pode_editar);
$$;

-- ============================================================================================ a pagar (Omie)
create table public.fin_fluxo_pagar_importacoes (
  id         uuid primary key default gen_random_uuid(),
  empresa    text not null check (empresa in ('VARELA', 'NAZÁRIO')),
  arquivo    text not null check (length(arquivo) <= 200),
  gerado     text check (length(gerado) <= 200),           -- "gerado ontem às 18:26" (cabeçalho do relatório)
  de         date not null,
  ate        date not null,
  linhas     int not null,
  total      numeric(16, 2) not null,
  criado_por uuid references public.profiles(id),
  criado_em  timestamptz not null default now()
);

-- soma por empresa × dia × filial × grupo de categoria (o relatório tem uma linha por conta; aqui só o que a tela usa)
create table public.fin_fluxo_pagar (
  id            bigint generated always as identity primary key,
  importacao_id uuid not null references public.fin_fluxo_pagar_importacoes(id),
  empresa       text not null check (empresa in ('VARELA', 'NAZÁRIO')),
  data          date not null,
  filial        text check (filial ~ '^F\d{3}$'),             -- departamento do Omie (null = sem filial)
  grupo         text not null default '' check (length(grupo) <= 120),
  valor         numeric(16, 2) not null                        -- positivo = a pagar
);
create index fin_fluxo_pagar_empresa_data on public.fin_fluxo_pagar (empresa, data);
create index fin_fluxo_pagar_importacao on public.fin_fluxo_pagar (importacao_id);

-- ============================================================================================ previsões e textos
create table public.fin_fluxo_previsoes (
  empresa        text not null check (empresa in ('VARELA', 'NAZÁRIO')),
  data           date not null,
  campo          text not null check (campo in ('receber', 'cartao')),
  valor          numeric(16, 2) not null,
  atualizado_por uuid references public.profiles(id),
  atualizado_em  timestamptz not null default now(),
  primary key (empresa, data, campo)
);

create table public.fin_fluxo_motivos (
  empresa        text not null check (empresa in ('VARELA', 'NAZÁRIO')),
  data           date not null,
  texto          text not null check (length(texto) between 1 and 500),
  atualizado_por uuid references public.profiles(id),
  atualizado_em  timestamptz not null default now(),
  primary key (empresa, data)
);

-- anotações para a diretoria (quadro ao lado do fluxo): quem escreveu, quando, se é importante e se já foi resolvida
create table public.fin_fluxo_notas (
  id            uuid primary key default gen_random_uuid(),
  empresa       text check (empresa in ('VARELA', 'NAZÁRIO')),   -- null = as duas
  referencia    date,                                            -- dia a que se refere (opcional)
  texto         text not null check (length(texto) between 1 and 2000),
  importante    boolean not null default false,
  autor         uuid not null default auth.uid() references public.profiles(id),
  criado_em     timestamptz not null default now(),
  resolvida_em  timestamptz,
  resolvida_por uuid references public.profiles(id)
);
create index fin_fluxo_notas_criado on public.fin_fluxo_notas (criado_em desc);

-- ============================================================================================ importação
-- Troca o a pagar da empresa nos dias que o relatório cobre (do primeiro ao último dia com conta) numa transação só.
-- p_linhas = [{ data: 'aaaa-mm-dd', filial: 'F301' | null, grupo: '...', valor: 123.45 }, ...]
create function public.fin_fluxo_importar_pagar(p_empresa text, p_arquivo text, p_gerado text, p_linhas jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_de date;
  v_ate date;
  v_n int;
  v_total numeric;
begin
  if not (select private.fluxo_pode_editar()) then
    raise exception 'Sem permissão para importar o a pagar.';
  end if;
  select min((l->>'data')::date), max((l->>'data')::date), count(*), coalesce(sum((l->>'valor')::numeric), 0)
    into v_de, v_ate, v_n, v_total
    from jsonb_array_elements(p_linhas) l;
  if v_n = 0 then
    raise exception 'O relatório não tem contas a pagar dessa empresa.';
  end if;
  insert into public.fin_fluxo_pagar_importacoes (empresa, arquivo, gerado, de, ate, linhas, total, criado_por)
    values (p_empresa, left(p_arquivo, 200), left(p_gerado, 200), v_de, v_ate, v_n, v_total, auth.uid())
    returning id into v_id;
  delete from public.fin_fluxo_pagar where empresa = p_empresa and data between v_de and v_ate;
  insert into public.fin_fluxo_pagar (importacao_id, empresa, data, filial, grupo, valor)
    select v_id, p_empresa, (l->>'data')::date, nullif(l->>'filial', ''), left(coalesce(l->>'grupo', ''), 120), (l->>'valor')::numeric
      from jsonb_array_elements(p_linhas) l;
  return v_id;
end;
$$;
revoke execute on function public.fin_fluxo_importar_pagar(text, text, text, jsonb) from public, anon;
grant execute on function public.fin_fluxo_importar_pagar(text, text, text, jsonb) to authenticated;

-- ============================================================================================ RLS
alter table public.acesso_telas                enable row level security;
alter table public.fin_fluxo_pagar_importacoes enable row level security;
alter table public.fin_fluxo_pagar             enable row level security;
alter table public.fin_fluxo_previsoes         enable row level security;
alter table public.fin_fluxo_motivos           enable row level security;
alter table public.fin_fluxo_notas             enable row level security;

-- cada um vê o que tem liberado; admin e financeiro veem e mexem nos acessos da tela do fluxo
create policy atel_sel on public.acesso_telas for select to authenticated
  using (user_id = (select auth.uid()) or (select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy atel_ins on public.acesso_telas for insert to authenticated
  with check ((select private.sou_admin()) or ((select private.tem_papel('financeiro')) and rota = '/financeiro/fluxo-caixa'));
create policy atel_upd on public.acesso_telas for update to authenticated
  using ((select private.sou_admin()) or ((select private.tem_papel('financeiro')) and rota = '/financeiro/fluxo-caixa'))
  with check ((select private.sou_admin()) or ((select private.tem_papel('financeiro')) and rota = '/financeiro/fluxo-caixa'));
create policy atel_del on public.acesso_telas for delete to authenticated
  using ((select private.sou_admin()) or ((select private.tem_papel('financeiro')) and rota = '/financeiro/fluxo-caixa'));

create policy ffpi_sel on public.fin_fluxo_pagar_importacoes for select to authenticated using ((select private.fluxo_pode_ver()));
create policy ffpi_ins on public.fin_fluxo_pagar_importacoes for insert to authenticated with check ((select private.fluxo_pode_editar()));

create policy ffp_sel on public.fin_fluxo_pagar for select to authenticated using ((select private.fluxo_pode_ver()));
create policy ffp_ins on public.fin_fluxo_pagar for insert to authenticated with check ((select private.fluxo_pode_editar()));
create policy ffp_del on public.fin_fluxo_pagar for delete to authenticated using ((select private.fluxo_pode_editar()));

create policy ffprev_sel on public.fin_fluxo_previsoes for select to authenticated using ((select private.fluxo_pode_ver()));
create policy ffprev_ins on public.fin_fluxo_previsoes for insert to authenticated with check ((select private.fluxo_pode_editar()));
create policy ffprev_upd on public.fin_fluxo_previsoes for update to authenticated using ((select private.fluxo_pode_editar())) with check ((select private.fluxo_pode_editar()));
create policy ffprev_del on public.fin_fluxo_previsoes for delete to authenticated using ((select private.fluxo_pode_editar()));

create policy ffmot_sel on public.fin_fluxo_motivos for select to authenticated using ((select private.fluxo_pode_ver()));
create policy ffmot_ins on public.fin_fluxo_motivos for insert to authenticated with check ((select private.fluxo_pode_editar()));
create policy ffmot_upd on public.fin_fluxo_motivos for update to authenticated using ((select private.fluxo_pode_editar())) with check ((select private.fluxo_pode_editar()));
create policy ffmot_del on public.fin_fluxo_motivos for delete to authenticated using ((select private.fluxo_pode_editar()));

-- anotação: quem vê o fluxo escreve; resolve quem edita o fluxo ou o autor; apaga o autor ou o administrador
create policy ffnot_sel on public.fin_fluxo_notas for select to authenticated using ((select private.fluxo_pode_ver()));
create policy ffnot_ins on public.fin_fluxo_notas for insert to authenticated
  with check ((select private.fluxo_pode_ver()) and autor = (select auth.uid()));
create policy ffnot_upd on public.fin_fluxo_notas for update to authenticated
  using ((select private.fluxo_pode_editar()) or autor = (select auth.uid()))
  with check ((select private.fluxo_pode_editar()) or autor = (select auth.uid()));
create policy ffnot_del on public.fin_fluxo_notas for delete to authenticated
  using (autor = (select auth.uid()) or (select private.sou_admin()));
