-- 0035 — Regras automáticas da conciliação (motor de regras).
-- Uma regra tem condições (nome contém, raiz do CNPJ, filiais, faixa de valor, tipo de pendência) e ações:
--   • categoria e/ou departamento da Omie para as contas que casam (planilha e API);
--   • tratar sozinha a pendência que casa (resolver ou justificar), sempre com motivo e histórico "regra".
-- Decisão de uma pessoa nunca é trocada por regra: só pendência em aberto ("pendente") é tratada.
-- ADITIVA: uma tabela nova, uma coluna nova em conc_pendencias e uma função de contagem.

create table if not exists public.conc_regras (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (char_length(nome) between 2 and 80),
  ativo              boolean not null default true,
  ordem              integer not null default 100,          -- menor primeiro; vale a 1ª regra que casa para cada ação
  -- condições (todas as preenchidas precisam bater)
  nome_contem        text check (nome_contem is null or char_length(nome_contem) between 2 and 80),  -- beneficiário, fornecedor do Trier ou fornecedor real
  cnpj_raiz          char(8) check (cnpj_raiz is null or cnpj_raiz ~ '^\d{8}$'),
  filiais            integer[] not null default '{}',       -- vazio = todas
  valor_min          numeric(14,2),
  valor_max          numeric(14,2),
  problemas          text[] not null default '{}',          -- só para pendências: SO_TRIER, SO_DDA, VALOR… (vazio = qualquer)
  -- ações
  categoria_omie     text check (categoria_omie is null or char_length(categoria_omie) between 2 and 70),
  departamento_omie  text check (departamento_omie is null or char_length(departamento_omie) between 2 and 80),
  pendencia_acao     conc_status_pendencia check (pendencia_acao is null or pendencia_acao in ('resolvido', 'justificado')),
  pendencia_motivo   text check (pendencia_motivo is null or char_length(pendencia_motivo) between 3 and 200),
  -- uso
  vezes              integer not null default 0,
  ultima_vez         timestamptz,
  criado_por         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint conc_regras_tem_condicao check (
    nome_contem is not null or cnpj_raiz is not null or cardinality(filiais) > 0 or valor_min is not null or valor_max is not null or cardinality(problemas) > 0
  ),
  constraint conc_regras_tem_acao check (categoria_omie is not null or departamento_omie is not null or pendencia_acao is not null),
  constraint conc_regras_motivo check (pendencia_acao is null or pendencia_motivo is not null),
  constraint conc_regras_faixa check (valor_min is null or valor_max is null or valor_min <= valor_max)
);
create index if not exists conc_regras_ativas_idx on public.conc_regras (ordem, nome) where ativo;
drop trigger if exists t_conc_regras_upd on public.conc_regras;
create trigger t_conc_regras_upd before update on public.conc_regras for each row execute function public.set_updated_at();

alter table public.conc_regras enable row level security;
drop policy if exists creg_sel on public.conc_regras;
create policy creg_sel on public.conc_regras for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
drop policy if exists creg_wr on public.conc_regras;
create policy creg_wr on public.conc_regras for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

-- pendência tratada por regra: qual regra (para contar, filtrar e reabrir se a regra deixar de valer)
alter table public.conc_pendencias add column if not exists regra_id uuid references public.conc_regras(id) on delete set null;
create index if not exists conc_pendencias_regra_idx on public.conc_pendencias (regra_id) where regra_id is not null;

-- soma o uso das regras (quem chama precisa poder escrever nelas: o RLS vale aqui dentro)
create or replace function public.conc_regras_registrar_uso(p_ids uuid[], p_qtds integer[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.conc_regras r
     set vezes = r.vezes + u.qtd, ultima_vez = now()
    from unnest(p_ids, p_qtds) as u(id, qtd)
   where r.id = u.id and u.qtd > 0;
$$;
revoke all on function public.conc_regras_registrar_uso(uuid[], integer[]) from public, anon;
grant execute on function public.conc_regras_registrar_uso(uuid[], integer[]) to authenticated;
