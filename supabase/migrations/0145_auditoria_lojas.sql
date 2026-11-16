-- Auditoria de lojas: checklist de verificação das normas das farmácias (o papel "CHECKLIST" do auditor) e auditoria de
-- precificação (etiqueta × sistema, com relatório por regional ou filial). Base de preços para o código reduzido.
-- Só cria coisas novas.

-- quem audita: administrador, financeiro (todas as lojas) e coordenador (lojas da regional dele)
create or replace function private.pode_auditar_loja(b uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.sou_admin() or (private.tem_papel('financeiro', 'coordenador') and private.pode_ver_filial(b));
$$;
revoke all on function private.pode_auditar_loja(uuid) from public, anon;
grant execute on function private.pode_auditar_loja(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Checklist de auditoria
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.aud_checklists (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity unique,
  branch_id           uuid not null references public.branches (id),
  gerente_nome        text check (char_length(gerente_nome) <= 120),
  auditor_id          uuid references public.profiles (id) on delete set null,
  auditor_nome        text,
  aberto_em           timestamptz not null,
  finalizado_em       timestamptz not null default now(),
  -- [{ "n": 1, "pergunta": "…", "comentario": "…", "itens": [{ "item": "Caixotes", "resposta": "sim" }] }]
  -- (o texto vai junto: mudar a lista não muda o histórico)
  respostas           jsonb not null,
  observacao          text check (char_length(observacao) <= 4000),
  anotacoes           text check (char_length(anotacoes) <= 4000),
  situacao            text not null default 'finalizado' check (situacao in ('finalizado', 'cancelado')),
  cancelado_por       uuid references public.profiles (id) on delete set null,
  cancelado_em        timestamptz,
  motivo_cancelamento text check (char_length(motivo_cancelamento) <= 500),
  criado_em           timestamptz not null default now()
);
create index if not exists aud_checklists_loja_idx on public.aud_checklists (branch_id, finalizado_em desc);
create index if not exists aud_checklists_data_idx on public.aud_checklists (finalizado_em desc);

create or replace function private.aud_checklist_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_q jsonb;
  v_i jsonb;
begin
  if tg_op = 'INSERT' then
    if jsonb_typeof(new.respostas) <> 'array' or jsonb_array_length(new.respostas) not between 1 and 60 then
      raise exception 'Responda as perguntas do checklist.';
    end if;
    for v_q in select * from jsonb_array_elements(new.respostas) loop
      if coalesce(v_q ->> 'pergunta', '') = '' or jsonb_typeof(v_q -> 'itens') <> 'array' or jsonb_array_length(v_q -> 'itens') < 1 then
        raise exception 'Checklist incompleto.';
      end if;
      for v_i in select * from jsonb_array_elements(v_q -> 'itens') loop
        if coalesce(v_i ->> 'resposta', '') not in ('sim', 'nao', 'regular', 'nao_utilizar') then
          raise exception 'Responda todos os itens (Sim, Não, Regular ou Não utilizar).';
        end if;
      end loop;
    end loop;
    if new.aberto_em is null or new.aberto_em > now() + interval '5 minutes' or new.aberto_em < now() - interval '3 days' then
      new.aberto_em := now();
    end if;
    new.auditor_id := auth.uid();
    new.auditor_nome := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
    new.finalizado_em := now();
    new.criado_em := now();
    new.situacao := 'finalizado';
    new.cancelado_por := null; new.cancelado_em := null; new.motivo_cancelamento := null;
    return new;
  end if;

  -- o que foi auditado não muda (para corrigir: cancelar e fazer de novo)
  new.branch_id := old.branch_id; new.gerente_nome := old.gerente_nome; new.respostas := old.respostas;
  new.observacao := old.observacao; new.anotacoes := old.anotacoes; new.aberto_em := old.aberto_em;
  new.finalizado_em := old.finalizado_em; new.auditor_id := old.auditor_id; new.auditor_nome := old.auditor_nome;
  new.criado_em := old.criado_em;
  if new.situacao is distinct from old.situacao then
    if old.situacao <> 'finalizado' or new.situacao <> 'cancelado' then raise exception 'Este checklist já foi cancelado.'; end if;
    if not (private.sou_admin() or old.auditor_id = auth.uid()) then raise exception 'Só quem fez o checklist cancela.'; end if;
    if coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    new.cancelado_por := auth.uid(); new.cancelado_em := now();
  else
    new.cancelado_por := old.cancelado_por; new.cancelado_em := old.cancelado_em; new.motivo_cancelamento := old.motivo_cancelamento;
  end if;
  return new;
end;
$$;
drop trigger if exists aud_checklist_carimbar on public.aud_checklists;
create trigger aud_checklist_carimbar before insert or update on public.aud_checklists
  for each row execute function private.aud_checklist_carimbar();

alter table public.aud_checklists enable row level security;
-- vê: quem audita a loja, quem fez e o gerente da loja
create policy audck_sel on public.aud_checklists for select to authenticated
  using (private.pode_auditar_loja(branch_id) or auditor_id = (select auth.uid())
         or ((select private.tem_papel('gerente')) and private.pode_ver_filial(branch_id)));
create policy audck_ins on public.aud_checklists for insert to authenticated with check (private.pode_auditar_loja(branch_id));
create policy audck_upd on public.aud_checklists for update to authenticated
  using ((select private.sou_admin()) or auditor_id = (select auth.uid()))
  with check ((select private.sou_admin()) or auditor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------
-- Auditoria de precificação
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.aud_precificacoes (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity unique,
  branch_id           uuid not null references public.branches (id),
  auditor_id          uuid references public.profiles (id) on delete set null,
  auditor_nome        text,
  aberto_em           timestamptz not null default now(),
  finalizado_em       timestamptz,
  situacao            text not null default 'em_andamento' check (situacao in ('em_andamento', 'finalizada', 'cancelada')),
  qtd_verificada      integer check (qtd_verificada between 1 and 100000),
  qtd_divergente      integer check (qtd_divergente >= 0),
  observacao          text check (char_length(observacao) <= 2000),
  cancelado_por       uuid references public.profiles (id) on delete set null,
  cancelado_em        timestamptz,
  motivo_cancelamento text check (char_length(motivo_cancelamento) <= 500)
);
create index if not exists aud_prec_loja_idx on public.aud_precificacoes (branch_id, finalizado_em desc);
create index if not exists aud_prec_data_idx on public.aud_precificacoes (situacao, finalizado_em desc);
create index if not exists aud_prec_auditor_idx on public.aud_precificacoes (auditor_id, situacao);

create table if not exists public.aud_precificacao_itens (
  id                  uuid primary key default gen_random_uuid(),
  precificacao_id     uuid not null references public.aud_precificacoes (id) on delete cascade,
  codigo              text not null check (char_length(codigo) between 1 and 30),
  produto             text not null check (char_length(produto) between 1 and 200),
  valor_sistema       numeric(12, 2) not null check (valor_sistema >= 0),
  valor_etiqueta      numeric(12, 2) not null check (valor_etiqueta >= 0),
  diferenca           numeric(12, 2) generated always as (valor_etiqueta - valor_sistema) stored,
  sistema_confirmado  boolean not null default false,
  da_base             boolean not null default false,
  criado_em           timestamptz not null default now()
);
create index if not exists aud_prec_itens_idx on public.aud_precificacao_itens (precificacao_id, criado_em);

create or replace function private.aud_precificacao_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_itens int;
begin
  if tg_op = 'INSERT' then
    new.auditor_id := auth.uid();
    new.auditor_nome := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
    new.aberto_em := now();
    new.situacao := 'em_andamento';
    new.finalizado_em := null; new.qtd_divergente := null;
    new.cancelado_por := null; new.cancelado_em := null; new.motivo_cancelamento := null;
    return new;
  end if;

  if not (private.sou_admin() or old.auditor_id = auth.uid()) then raise exception 'Só quem fez a auditoria altera.'; end if;
  new.branch_id := old.branch_id; new.auditor_id := old.auditor_id; new.auditor_nome := old.auditor_nome; new.aberto_em := old.aberto_em;

  if old.situacao = 'cancelada' then raise exception 'Esta auditoria foi cancelada.'; end if;

  if new.situacao = 'cancelada' and old.situacao <> 'cancelada' then
    if coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    new.cancelado_por := auth.uid(); new.cancelado_em := now();
    new.qtd_verificada := old.qtd_verificada; new.observacao := old.observacao;
    new.finalizado_em := old.finalizado_em; new.qtd_divergente := old.qtd_divergente;
    return new;
  end if;
  new.cancelado_por := old.cancelado_por; new.cancelado_em := old.cancelado_em; new.motivo_cancelamento := old.motivo_cancelamento;

  if old.situacao = 'finalizada' then raise exception 'Esta auditoria já foi finalizada.'; end if;

  if new.situacao = 'finalizada' then
    v_itens := (select count(*) from public.aud_precificacao_itens where precificacao_id = old.id);
    if new.qtd_verificada is null or new.qtd_verificada < 1 then raise exception 'Informe a quantidade de produtos verificados.'; end if;
    if new.qtd_verificada < v_itens then
      raise exception 'A quantidade verificada (%) não pode ser menor que os produtos com divergência (%).', new.qtd_verificada, v_itens;
    end if;
    new.qtd_divergente := v_itens;
    new.finalizado_em := now();
  elsif new.situacao = 'em_andamento' then
    new.finalizado_em := null; new.qtd_divergente := null;
  else
    raise exception 'Situação inválida.';
  end if;
  return new;
end;
$$;
drop trigger if exists aud_precificacao_carimbar on public.aud_precificacoes;
create trigger aud_precificacao_carimbar before insert or update on public.aud_precificacoes
  for each row execute function private.aud_precificacao_carimbar();

-- itens só entram e saem enquanto a auditoria está em andamento, pela pessoa que a abriu (ou o administrador)
create or replace function private.aud_prec_item_conferir()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.precificacao_id else new.precificacao_id end;
  v_sit text;
  v_auditor uuid;
begin
  select situacao, auditor_id into v_sit, v_auditor from public.aud_precificacoes where id = v_id;
  if v_sit is null then raise exception 'Auditoria não encontrada.'; end if;
  if v_sit <> 'em_andamento' then raise exception 'A auditoria já foi finalizada ou cancelada.'; end if;
  if not (private.sou_admin() or v_auditor = auth.uid()) then raise exception 'Só quem abriu a auditoria lança os produtos.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then raise exception 'Para corrigir, exclua o produto e lance de novo.'; end if;
  if not new.sistema_confirmado then raise exception 'Confirme que o valor no sistema está correto.'; end if;
  if new.valor_etiqueta = new.valor_sistema then raise exception 'Sem diferença entre etiqueta e sistema: não precisa lançar.'; end if;
  new.criado_em := now();
  return new;
end;
$$;
drop trigger if exists aud_prec_item_conferir on public.aud_precificacao_itens;
create trigger aud_prec_item_conferir before insert or update or delete on public.aud_precificacao_itens
  for each row execute function private.aud_prec_item_conferir();

alter table public.aud_precificacoes enable row level security;
alter table public.aud_precificacao_itens enable row level security;
create policy audpr_sel on public.aud_precificacoes for select to authenticated
  using (private.pode_auditar_loja(branch_id) or auditor_id = (select auth.uid())
         or ((select private.tem_papel('gerente')) and situacao = 'finalizada' and private.pode_ver_filial(branch_id)));
create policy audpr_ins on public.aud_precificacoes for insert to authenticated with check (private.pode_auditar_loja(branch_id));
create policy audpr_upd on public.aud_precificacoes for update to authenticated
  using ((select private.sou_admin()) or auditor_id = (select auth.uid()))
  with check ((select private.sou_admin()) or auditor_id = (select auth.uid()));
-- os itens seguem a auditoria (quem vê a auditoria vê os itens)
create policy audpi_sel on public.aud_precificacao_itens for select to authenticated
  using (exists (select 1 from public.aud_precificacoes a where a.id = precificacao_id));
create policy audpi_ins on public.aud_precificacao_itens for insert to authenticated
  with check (exists (select 1 from public.aud_precificacoes a where a.id = precificacao_id
                       and ((select private.sou_admin()) or a.auditor_id = (select auth.uid()))));
create policy audpi_del on public.aud_precificacao_itens for delete to authenticated
  using (exists (select 1 from public.aud_precificacoes a where a.id = precificacao_id
                  and ((select private.sou_admin()) or a.auditor_id = (select auth.uid()))));

-- ---------------------------------------------------------------------------------------------------------------
-- Base de preços (código reduzido → produto e preço de venda), carregada da planilha do Trier
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.aud_precos (
  codigo        text primary key check (char_length(codigo) between 1 and 30),
  descricao     text not null check (char_length(descricao) <= 200),
  preco         numeric(12, 2) not null check (preco >= 0),
  ean           text check (char_length(ean) <= 30),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);
create index if not exists aud_precos_ean_idx on public.aud_precos (ean) where ean is not null;
alter table public.aud_precos enable row level security;
create policy audpc_sel on public.aud_precos for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')));
create policy audpc_ins on public.aud_precos for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy audpc_upd on public.aud_precos for update to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy audpc_del on public.aud_precos for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

-- lojas que a pessoa pode auditar, com a regional, o CNPJ e o gerente (responsável do cadastro da filial)
create or replace function public.aud_lojas()
returns table (id uuid, codigo text, nome text, regional text, cnpj text, razao_social text, gerente text)
language sql
stable
security definer
set search_path = public, private
as $$
  select b.id, b.codigo, b.nome, b.regional, b.cnpj, b.razao_social,
         coalesce(nullif(trim(e.nome), ''), nullif(trim(b.responsavel_nome), ''))
    from public.branches b
    left join public.employees e on e.id = b.responsavel_employee_id
   where b.ativo and private.pode_auditar_loja(b.id)
   order by b.codigo;
$$;
revoke all on function public.aud_lojas() from public, anon;
grant execute on function public.aud_lojas() to authenticated;
