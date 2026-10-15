-- 0030 — Diferença de caixa: nomes para o financeiro sem abrir o cadastro do RH.
-- O financeiro não lê employees nem profiles (RLS do RH). Para ligar operador → funcionário e mostrar quem
-- justificou/decidiu, ganha só o mínimo: nome, cargo, matrícula e loja (sem CPF, salário ou contato).
-- ADITIVA: duas colunas novas em caixa_diferencas e uma função de leitura.

alter table public.caixa_diferencas add column if not exists justificada_por_nome text;
alter table public.caixa_diferencas add column if not exists decidida_por_nome text;

create or replace function public.caixa_justificar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare r public.caixa_diferencas;
begin
  select * into r from public.caixa_diferencas where id = p_id;
  if r.id is null or r.classe <> 'quebra' then raise exception 'Quebra de caixa não encontrada.'; end if;
  if not (private.pode_justificar_caixa(r.employee_id, r.branch_id) or private.sou_admin() or private.tem_papel('financeiro')) then
    raise exception 'Você não responde por este caixa.';
  end if;
  if r.andamento in ('mantida', 'abonada') then raise exception 'O financeiro já decidiu esta quebra.'; end if;
  if length(coalesce(trim(p_texto), '')) < 10 then raise exception 'Escreva a justificativa (pelo menos 10 letras).'; end if;
  update public.caixa_diferencas
     set justificativa = left(trim(p_texto), 2000), justificada_por = auth.uid(), justificada_em = now(), andamento = 'justificada',
         justificada_por_nome = (select nullif(trim(p.nome), '') from public.profiles p where p.id = auth.uid())
   where id = p_id;
end;
$$;

-- funcionários para o financeiro ligar operadores (mínimo necessário)
create or replace function public.caixa_funcionarios()
returns table (id uuid, nome text, cargo text, matricula text, branch_id uuid, filial text, status text)
language sql
stable
security definer
set search_path = private, public
as $$
  select e.id, e.nome, e.cargo, e.matricula, e.branch_id, b.codigo, e.status::text
    from public.employees e
    join public.branches b on b.id = e.branch_id
   where private.sou_admin() or private.tem_papel('financeiro', 'rh')
   order by e.nome;
$$;
revoke all on function public.caixa_funcionarios() from public, anon;
grant execute on function public.caixa_funcionarios() to authenticated;
