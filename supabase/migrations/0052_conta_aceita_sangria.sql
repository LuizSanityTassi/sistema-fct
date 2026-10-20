-- Contas da carteira que a loja pode escolher como destino do depósito na sangria.
-- Pedido do usuário (20/10/2026): COFRE - VALE DO ITAJAÍ, CAIXA FINANCEIRO e ITAU FILIAL não entram nas sangrias
-- (continuam na Carteira). Aditiva: coluna nova com padrão "sim" + 3 contas marcadas "não".

alter table public.fin_contas_bancarias add column aceita_sangria boolean not null default true;
comment on column public.fin_contas_bancarias.aceita_sangria is 'Aparece como banco de depósito no cadastro de sangria.';

update public.fin_contas_bancarias
   set aceita_sangria = false
 where apelido in ('COFRE - VALE DO ITAJAÍ', 'CAIXA FINANCEIRO', 'ITAU FILIAL');

create or replace function public.contas_para_deposito()
returns table (id uuid, apelido text, banco text, tipo text)
language sql
stable
security definer
set search_path = public, private
as $$
  select c.id, c.apelido, c.banco, c.tipo
    from public.fin_contas_bancarias c
   where c.ativa
     and c.aceita_sangria
     and ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'gerente', 'usuario', 'coordenador')))
   order by c.apelido;
$$;

-- O banco também barra a conta fora da lista (não só a tela).
create or replace function private.sangria_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $function$
declare
  v_nome text := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
  v_fin boolean := private.sou_admin() or private.tem_papel('financeiro');
begin
  if tg_op = 'INSERT' then
    new.conta_apelido := (select apelido from public.fin_contas_bancarias where id = new.conta_id and ativa and aceita_sangria);
    if new.conta_apelido is null then raise exception 'Escolha uma conta da carteira liberada para sangria.'; end if;
    new.situacao := 'pendente';
    new.criada_por := auth.uid();
    new.criada_por_nome := v_nome;
    new.criada_em := now();
    new.conferida_por := null; new.conferida_por_nome := null; new.conferida_em := null; new.conferencia_obs := null;
    new.cancelada_por := null; new.cancelada_por_nome := null; new.cancelada_em := null; new.motivo_cancelamento := null;
    return new;
  end if;

  new.branch_id := old.branch_id; new.conta_id := old.conta_id; new.conta_apelido := old.conta_apelido;
  new.data_retirada := old.data_retirada; new.data_deposito := old.data_deposito; new.numero_deposito := old.numero_deposito;
  new.valor := old.valor; new.observacao := old.observacao;
  new.criada_por := old.criada_por; new.criada_por_nome := old.criada_por_nome; new.criada_em := old.criada_em;

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
