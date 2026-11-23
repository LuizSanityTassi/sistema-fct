-- Conferência dos comprovantes de venda pelo financeiro (Financeiro → Conferência de comprovantes).
-- conferencia: pendente (a conferir) · conferido · divergente (com problema: o financeiro aponta o que falta e a loja
-- corrige anexando o arquivo certo, o que devolve o comprovante para "a conferir"). Só acrescenta colunas e troca as
-- funções do módulo (que tem horas de uso); nada é apagado.

alter table public.venda_comprovantes
  add column if not exists conferencia text not null default 'pendente',
  add column if not exists conferido_por uuid references public.profiles (id) on delete set null,
  add column if not exists conferido_por_nome text,
  add column if not exists conferido_em timestamptz,
  add column if not exists conferencia_obs text;
alter table public.venda_comprovantes drop constraint if exists venda_comprovantes_conferencia_check;
alter table public.venda_comprovantes add constraint venda_comprovantes_conferencia_check
  check (conferencia in ('pendente', 'conferido', 'divergente'));
alter table public.venda_comprovantes drop constraint if exists venda_comprovantes_conferencia_obs_check;
alter table public.venda_comprovantes add constraint venda_comprovantes_conferencia_obs_check
  check (char_length(conferencia_obs) <= 500);
create index if not exists venda_comprovantes_conferencia_idx on public.venda_comprovantes (conferencia, data_compra desc)
  where situacao = 'ativo';

-- anexar: enquanto ativo e ainda não conferido
create or replace function private.pode_anexar_comprovante(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.venda_comprovantes c
     where c.id = p_id and c.situacao = 'ativo' and c.conferencia <> 'conferido'
       and (c.criada_por = auth.uid() or private.pode_cadastrar_comprovante(c.branch_id))
  );
$$;

create or replace function private.comprovante_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_nome text := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
  v_fin boolean := private.sou_admin() or private.tem_papel('financeiro');
  v_reabrir boolean := coalesce(current_setting('fct.comprovante_reabrir', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    new.empresa := nullif(trim(new.empresa), '');
    new.cliente := trim(new.cliente);
    new.numero_venda := nullif(trim(new.numero_venda), '');
    new.situacao := 'ativo';
    new.criada_por := auth.uid();
    new.criada_por_nome := v_nome;
    new.criada_em := now();
    new.cancelada_por := null; new.cancelada_por_nome := null; new.cancelada_em := null; new.motivo_cancelamento := null;
    new.conferencia := 'pendente';
    new.conferido_por := null; new.conferido_por_nome := null; new.conferido_em := null; new.conferencia_obs := null;
    return new;
  end if;

  -- o cadastrado não muda (para corrigir: cancelar e cadastrar de novo)
  new.branch_id := old.branch_id; new.tipo := old.tipo; new.empresa := old.empresa; new.cliente := old.cliente;
  new.valor := old.valor; new.parcelas := old.parcelas; new.data_compra := old.data_compra;
  new.numero_venda := old.numero_venda; new.observacao := old.observacao;
  new.criada_por := old.criada_por; new.criada_por_nome := old.criada_por_nome; new.criada_em := old.criada_em;

  -- cancelamento
  if new.situacao is distinct from old.situacao then
    if old.situacao = 'cancelado' then raise exception 'Comprovante cancelado não volta: cadastre de novo.'; end if;
    if old.conferencia = 'conferido' then raise exception 'Comprovante conferido não se cancela: o financeiro desfaz a conferência antes.'; end if;
    if not (v_fin or old.criada_por = auth.uid()) then
      raise exception 'Só quem cadastrou ou o financeiro cancela.';
    end if;
    if coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    new.cancelada_por := auth.uid(); new.cancelada_por_nome := v_nome; new.cancelada_em := now();
    -- cancelado não fica na fila da conferência
    new.conferencia := old.conferencia;
    new.conferido_por := old.conferido_por; new.conferido_por_nome := old.conferido_por_nome;
    new.conferido_em := old.conferido_em; new.conferencia_obs := old.conferencia_obs;
    return new;
  end if;
  new.cancelada_por := old.cancelada_por; new.cancelada_por_nome := old.cancelada_por_nome; new.cancelada_em := old.cancelada_em;
  new.motivo_cancelamento := old.motivo_cancelamento;

  -- conferência
  if new.conferencia is distinct from old.conferencia then
    if old.situacao = 'cancelado' then raise exception 'Comprovante cancelado não se confere.'; end if;
    if v_reabrir and old.conferencia = 'divergente' and new.conferencia = 'pendente' then
      -- a loja anexou a correção: volta para a conferir e guarda o problema apontado
      new.conferido_por := old.conferido_por; new.conferido_por_nome := old.conferido_por_nome;
      new.conferido_em := old.conferido_em; new.conferencia_obs := old.conferencia_obs;
      return new;
    end if;
    if not v_fin then raise exception 'Só o financeiro confere comprovantes.'; end if;
    if new.conferencia = 'pendente' then
      new.conferido_por := null; new.conferido_por_nome := null; new.conferido_em := null; new.conferencia_obs := null;
    else
      if new.conferencia = 'divergente' and coalesce(trim(new.conferencia_obs), '') = '' then
        raise exception 'Conte qual é o problema do comprovante.';
      end if;
      new.conferencia_obs := nullif(trim(new.conferencia_obs), '');
      new.conferido_por := auth.uid(); new.conferido_por_nome := v_nome; new.conferido_em := now();
    end if;
  else
    new.conferido_por := old.conferido_por; new.conferido_por_nome := old.conferido_por_nome; new.conferido_em := old.conferido_em;
    if not v_fin then new.conferencia_obs := old.conferencia_obs; end if;
  end if;
  return new;
end;
$$;

-- a loja anexou arquivo num comprovante com problema: volta sozinho para "a conferir"
create or replace function private.comprovante_anexo_reabre()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform set_config('fct.comprovante_reabrir', '1', true);
  update public.venda_comprovantes set conferencia = 'pendente'
   where id = new.comprovante_id and conferencia = 'divergente' and situacao = 'ativo';
  perform set_config('fct.comprovante_reabrir', '', true);
  return new;
end;
$$;
revoke all on function private.comprovante_anexo_reabre() from public, anon, authenticated;
drop trigger if exists comprovante_anexo_reabre on public.venda_comprovante_anexos;
create trigger comprovante_anexo_reabre after insert on public.venda_comprovante_anexos
  for each row execute function private.comprovante_anexo_reabre();

-- totais com a conferência (a tela do financeiro mostra a conferir / com problema / conferidos)
drop function if exists public.comprovantes_totais(date, date, uuid, uuid, text, text, text);
create or replace function public.comprovantes_totais(
  p_de date,
  p_ate date,
  p_rede uuid default null,
  p_filial uuid default null,
  p_tipo text default null,
  p_situacao text default null,
  p_busca text default null,
  p_conferencia text default null
)
returns table (tipo text, conferencia text, qtd bigint, valor numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select c.tipo, c.conferencia, count(*), coalesce(sum(c.valor), 0)
    from public.venda_comprovantes c
    join public.branches b on b.id = c.branch_id
   where c.data_compra between p_de and p_ate
     and (p_rede is null or b.organization_id = p_rede)
     and (p_filial is null or c.branch_id = p_filial)
     and (p_tipo is null or c.tipo = p_tipo)
     and (p_situacao is null or c.situacao = p_situacao)
     and (p_conferencia is null or c.conferencia = p_conferencia)
     and (p_busca is null
          or c.cliente ilike '%' || p_busca || '%'
          or c.empresa ilike '%' || p_busca || '%'
          or c.numero_venda ilike '%' || p_busca || '%')
   group by c.tipo, c.conferencia;
$$;
revoke all on function public.comprovantes_totais(date, date, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.comprovantes_totais(date, date, uuid, uuid, text, text, text, text) to authenticated;
