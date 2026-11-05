-- Sangrias no Omie pelo portal, no lugar da Zanini (pedido do Luiz em 05/11/2026; a Zanini lançou pela última vez em 30/10).
-- Conferida pelo financeiro, a sangria vira conta a receber no Omie como a Zanini fazia: cliente "Cliente Sangrias",
-- categoria 1.01.93, a filial em 100% no departamento e o vencimento na data do depósito, na conta corrente da carteira.
-- Antes de lançar, o portal confere no Omie se a sangria já está lá (mesma filial, data e valor) e barra se estiver.
-- Nada é apagado: a carteira ganha o código da conta no Omie de cada empresa e as contas da Nazário que as lojas usam.

-- 1) carteira: a conta corrente no Omie de cada empresa (Varela e Nazário são Omies diferentes)
alter table public.fin_contas_bancarias
  add column if not exists omie_varela bigint,
  add column if not exists omie_nazario bigint;

-- Varela: banco, agência e conta conferidos com o cadastro de contas correntes do Omie da Varela em 05/11/2026
update public.fin_contas_bancarias set omie_varela = 11063543913 where apelido = 'CRESOL VARELA 2025' and banco = '133' and omie_varela is null;
update public.fin_contas_bancarias set omie_varela = 11063558653 where apelido = 'ITAU VARELA 2025' and banco = '341' and omie_varela is null;
update public.fin_contas_bancarias set omie_varela = 11063541360 where apelido = 'BANRISUL' and banco = '041' and omie_varela is null;
update public.fin_contas_bancarias set omie_varela = 11063542620 where apelido = 'BRADESCO' and banco = '237' and omie_varela is null;
update public.fin_contas_bancarias set omie_varela = 11063552658 where apelido = 'DAYCOVAL' and banco = '707' and omie_varela is null;
update public.fin_contas_bancarias set omie_varela = 11063563092 where apelido = 'SAFRA' and banco = '422' and omie_varela is null;
update public.fin_contas_bancarias set omie_varela = 11063566591 where apelido = 'SICREDI 2025' and banco = '748' and omie_varela is null;
-- o cofre existe nas duas empresas ("Caixinha Cofre")
update public.fin_contas_bancarias set omie_varela = 11062401918, omie_nazario = 3211198507 where apelido = 'COFRE' and tipo = 'cofre' and omie_varela is null and omie_nazario is null;

-- Nazário: as contas em que a Zanini lançava as sangrias das lojas da Nazário (Itaú 2125, Cresol 1047, Banco do Brasil 723,
-- Sicredi 477 e cofre 221 lançamentos, de 4943)
insert into public.fin_contas_bancarias (apelido, banco, agencia, conta, tipo, grupo, ativa, aceita_sangria, observacao, omie_nazario) values
  ('ITAU NAZÁRIO', '341', '6448', '13445-9', 'corrente', 'NAZÁRIO', true, true, 'Itaú Principal da Nazário no Omie (sangrias das lojas da Nazário).', 3211993439),
  ('CRESOL NAZÁRIO', '133', '2632', '43665-8', 'corrente', 'NAZÁRIO', true, true, 'Cresol da Nazário no Omie (sangrias das lojas da Nazário).', 3211995927),
  ('BANCO DO BRASIL NAZÁRIO', '001', '0875', '46685-9', 'corrente', 'NAZÁRIO', true, true, 'Banco do Brasil da Nazário no Omie (sangrias das lojas da Nazário).', 3211998894),
  ('SICREDI NAZÁRIO', '748', '2606', '20421-9', 'corrente', 'NAZÁRIO', true, true, 'Sicredi da Nazário no Omie (sangrias das lojas da Nazário).', 3211995131)
on conflict do nothing;

-- 2) sangria: o que aconteceu no Omie
alter table public.caixa_sangrias
  add column if not exists omie_empresa text check (omie_empresa in ('varela', 'nazario')),
  add column if not exists omie_codigo bigint,
  add column if not exists omie_vinculada boolean not null default false,
  add column if not exists omie_enviado_em timestamptz,
  add column if not exists omie_enviado_por_nome text,
  add column if not exists omie_situacao text check (omie_situacao in ('barrada', 'parecida', 'erro')),
  add column if not exists omie_mensagem text check (char_length(omie_mensagem) <= 1000),
  add column if not exists omie_sugerido bigint;
create index if not exists caixa_sangrias_omie_idx on public.caixa_sangrias (situacao, data_deposito) where omie_codigo is null;

-- empresa da filial no Omie (pela empresa do cadastro da filial)
create or replace function private.empresa_omie_da_filial(p_branch uuid) returns text
language sql stable security definer set search_path = private, public as $$
  select case upper(o.nome_fantasia) when 'VARELA' then 'varela' when 'NAZÁRIO' then 'nazario' when 'NAZARIO' then 'nazario' end
    from public.branches b join public.organizations o on o.id = b.organization_id
   where b.id = p_branch;
$$;
revoke all on function private.empresa_omie_da_filial(uuid) from public, anon;
grant execute on function private.empresa_omie_da_filial(uuid) to authenticated;

-- 3) carimbo: o mesmo de antes + o banco tem de ser da empresa da filial, o que veio do Omie só o financeiro grava e,
-- lançada no Omie, a sangria não volta a "a conferir" nem é cancelada por aqui (o lançamento de lá ficaria órfão)
create or replace function private.sangria_carimbar() returns trigger
language plpgsql security definer set search_path = private, public as $function$
declare
  v_nome text := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
  v_fin boolean := private.sou_admin() or private.tem_papel('financeiro');
  v_emp text;
begin
  if tg_op = 'INSERT' then
    new.conta_apelido := (select apelido from public.fin_contas_bancarias where id = new.conta_id and ativa and aceita_sangria);
    if new.conta_apelido is null then raise exception 'Escolha uma conta da carteira liberada para sangria.'; end if;
    v_emp := private.empresa_omie_da_filial(new.branch_id);
    if v_emp is not null and not exists (
         select 1 from public.fin_contas_bancarias c
          where c.id = new.conta_id
            and ((v_emp = 'varela' and c.omie_varela is not null) or (v_emp = 'nazario' and c.omie_nazario is not null))) then
      raise exception 'Esse banco não recebe sangria das lojas da %: escolha outro.', case v_emp when 'varela' then 'Varela' else 'Nazário' end;
    end if;
    new.situacao := 'pendente';
    new.criada_por := auth.uid();
    new.criada_por_nome := v_nome;
    new.criada_em := now();
    new.conferida_por := null; new.conferida_por_nome := null; new.conferida_em := null; new.conferencia_obs := null;
    new.cancelada_por := null; new.cancelada_por_nome := null; new.cancelada_em := null; new.motivo_cancelamento := null;
    new.omie_empresa := null; new.omie_codigo := null; new.omie_vinculada := false; new.omie_enviado_em := null;
    new.omie_enviado_por_nome := null; new.omie_situacao := null; new.omie_mensagem := null; new.omie_sugerido := null;
    return new;
  end if;

  new.branch_id := old.branch_id; new.conta_id := old.conta_id; new.conta_apelido := old.conta_apelido;
  new.data_retirada := old.data_retirada; new.data_deposito := old.data_deposito; new.numero_deposito := old.numero_deposito;
  new.valor := old.valor; new.observacao := old.observacao;
  new.criada_por := old.criada_por; new.criada_por_nome := old.criada_por_nome; new.criada_em := old.criada_em;

  -- o que veio do Omie: só o financeiro grava; depois de lançada, não muda mais
  if not v_fin or old.omie_codigo is not null then
    new.omie_empresa := old.omie_empresa; new.omie_codigo := old.omie_codigo; new.omie_vinculada := old.omie_vinculada;
    new.omie_enviado_em := old.omie_enviado_em; new.omie_enviado_por_nome := old.omie_enviado_por_nome;
  end if;
  if not v_fin then
    new.omie_situacao := old.omie_situacao; new.omie_mensagem := old.omie_mensagem; new.omie_sugerido := old.omie_sugerido;
  end if;
  if new.omie_codigo is not null and new.situacao is distinct from 'conferida' then
    raise exception 'Esta sangria já está no Omie (lançamento %): ela não volta a "a conferir" nem é cancelada por aqui. Acerte primeiro no Omie e fale com o administrador.', new.omie_codigo;
  end if;

  if new.situacao is distinct from old.situacao then
    if old.situacao = 'cancelada' then raise exception 'Sangria cancelada não volta: cadastre de novo.'; end if;
    if new.situacao = 'cancelada' then
      if not (v_fin or (old.situacao = 'pendente' and old.criada_por = auth.uid())) then
        raise exception 'Só quem cadastrou (antes da conferência) ou o financeiro cancela.';
      end if;
      if coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
      new.cancelada_por := auth.uid(); new.cancelada_por_nome := v_nome; new.cancelada_em := now();
    elsif not v_fin then
      raise exception 'Só o financeiro confere sangrias.';
    elsif new.situacao = 'conferida' then
      new.conferida_por := auth.uid(); new.conferida_por_nome := v_nome; new.conferida_em := now();
    else
      new.conferida_por := null; new.conferida_por_nome := null; new.conferida_em := null; new.conferencia_obs := null;
    end if;
  else
    new.conferida_por := old.conferida_por; new.conferida_por_nome := old.conferida_por_nome; new.conferida_em := old.conferida_em;
    new.cancelada_por := old.cancelada_por; new.cancelada_por_nome := old.cancelada_por_nome; new.cancelada_em := old.cancelada_em;
    new.motivo_cancelamento := old.motivo_cancelamento;
    if not v_fin then new.conferencia_obs := old.conferencia_obs; end if;
  end if;
  return new;
end;
$function$;

-- 4) cadastro: a loja só vê os bancos da empresa dela (os que têm conta no Omie dessa empresa)
drop function if exists public.contas_para_deposito();
create function public.contas_para_deposito() returns table (id uuid, apelido text, banco text, tipo text, empresas text[])
language sql stable security definer set search_path = public, private as $$
  select c.id, c.apelido, c.banco, c.tipo,
         array_remove(array[case when c.omie_varela is not null then 'varela' end, case when c.omie_nazario is not null then 'nazario' end], null)
    from public.fin_contas_bancarias c
   where c.ativa
     and c.aceita_sangria
     and ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'gerente', 'usuario', 'coordenador')))
   order by c.apelido;
$$;
revoke all on function public.contas_para_deposito() from public, anon;
grant execute on function public.contas_para_deposito() to authenticated;

drop function if exists public.lojas_para_sangria();
create function public.lojas_para_sangria() returns table (id uuid, codigo text, nome text, empresa text)
language sql stable security definer set search_path = public, private as $$
  select b.id, b.codigo, b.nome, private.empresa_omie_da_filial(b.id)
    from public.branches b
   where b.ativo and private.pode_cadastrar_sangria(b.id)
   order by b.codigo;
$$;
revoke all on function public.lojas_para_sangria() from public, anon;
grant execute on function public.lojas_para_sangria() to authenticated;
