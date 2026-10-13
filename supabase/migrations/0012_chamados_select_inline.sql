-- 0012 — Correção: a policy de SELECT de tickets não pode depender de private.pode_ver_ticket(id).
-- A função é STABLE e enxerga o snapshot do início do comando, então no INSERT ... RETURNING a linha
-- recém-criada ainda "não existe" para ela e o insert falhava com violação de RLS.
-- Solução: mesma regra, escrita sobre as colunas da própria linha.
drop policy if exists tk_sel on public.tickets;
create policy tk_sel on public.tickets for select to authenticated
  using (
    private.sou_admin()
    or solicitante = auth.uid()
    or responsavel = auth.uid()
    or (categoria = 'rh' and private.tem_papel('rh'))
    or (categoria = 'financeiro' and private.tem_papel('financeiro'))
    or (categoria <> 'rh' and (private.tem_papel('ti') or private.pode_ver_filial(branch_id)))
  );
