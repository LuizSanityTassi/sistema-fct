-- Digital do funcionário para o relógio de ponto. Guarda só o código (template) que o leitor gera a partir do dedo, nunca
-- a imagem, cifrado com uma chave gerada aqui dentro e guardada no Vault. Sem política de RLS: ninguém lê nem grava a
-- tabela direto, só pelas funções abaixo, e nenhuma delas devolve o código. Desligou, apaga.
create table public.ponto_digitais (
  employee_id uuid not null references public.employees (id) on delete cascade,
  dedo smallint not null check (dedo between 1 and 10),
  template_cifrado bytea not null,
  leitor text,
  definido_por uuid references auth.users (id) on delete set null,
  definido_em timestamptz not null default now(),
  primary key (employee_id, dedo)
);
create index ponto_digitais_definido_por_idx on public.ponto_digitais (definido_por);
alter table public.ponto_digitais enable row level security;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ponto_digital_chave', 'Chave que cifra as digitais do ponto');

create function public.ponto_cadastrar_digital(p_employee uuid, p_dedo smallint, p_template text, p_leitor text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chave text;
begin
  if auth.uid() is null or not private.gere_ponto_func(p_employee) then
    raise exception 'Sem permissão para cadastrar a digital deste funcionário.' using errcode = 'P0001';
  end if;
  if p_dedo not between 1 and 10 then raise exception 'Escolha o dedo.' using errcode = 'P0001'; end if;
  if p_template is null or length(p_template) not between 16 and 20000 or p_template !~ '^[A-Za-z0-9+/_=-]+$' then
    raise exception 'O leitor não devolveu uma digital válida. Tente de novo.' using errcode = 'P0001';
  end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  insert into public.ponto_digitais (employee_id, dedo, template_cifrado, leitor, definido_por, definido_em)
  values (p_employee, p_dedo, pgp_sym_encrypt(p_template, v_chave), left(p_leitor, 100), auth.uid(), now())
  on conflict (employee_id, dedo) do update set template_cifrado = excluded.template_cifrado, leitor = excluded.leitor, definido_por = excluded.definido_por, definido_em = now();
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'ponto_digitais', p_employee, jsonb_build_object('dedo', p_dedo, 'digital', 'cadastrada'));
end $$;
revoke all on function public.ponto_cadastrar_digital(uuid, smallint, text, text) from public, anon;
grant execute on function public.ponto_cadastrar_digital(uuid, smallint, text, text) to authenticated;

create function public.ponto_remover_digital(p_employee uuid, p_dedo smallint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not private.gere_ponto_func(p_employee) then
    raise exception 'Sem permissão para remover a digital deste funcionário.' using errcode = 'P0001';
  end if;
  delete from public.ponto_digitais where employee_id = p_employee and dedo = p_dedo;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'excluir', 'ponto_digitais', p_employee, jsonb_build_object('dedo', p_dedo, 'digital', 'removida'));
end $$;
revoke all on function public.ponto_remover_digital(uuid, smallint) from public, anon;
grant execute on function public.ponto_remover_digital(uuid, smallint) to authenticated;

-- Quais dedos cada um tem cadastrados (sem revelar a digital).
create function public.ponto_digitais_cadastradas(p_employees uuid[]) returns table (employee_id uuid, dedo smallint)
language sql stable security definer set search_path = public as $$
  select d.employee_id, d.dedo from public.ponto_digitais d where d.employee_id = any (p_employees) and private.pode_ver_ponto_func(d.employee_id);
$$;
revoke all on function public.ponto_digitais_cadastradas(uuid[]) from public, anon;
grant execute on function public.ponto_digitais_cadastradas(uuid[]) to authenticated;

create function private.ponto_apagar_digitais() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ponto_digitais where employee_id = new.id;
  return new;
end $$;
create trigger ponto_apagar_digitais_desligado after update of status on public.employees
  for each row when (new.status = 'desligado' and old.status is distinct from 'desligado')
  execute function private.ponto_apagar_digitais();
