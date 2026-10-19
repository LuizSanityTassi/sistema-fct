-- Cada setor vê e atende os chamados da própria categoria: Manutenção (manutencao), Compras (compras) e
-- Marketing (marketing). As regras que já existiam continuam iguais (RH só RH, Financeiro, TI vê tudo menos RH,
-- a loja vê os da loja, quem abriu e o responsável sempre veem). Só ACRESCENTA permissão.

create or replace function private.pode_ver_ticket(t uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.tickets k where k.id = t and (
      sou_admin()
      or k.solicitante = auth.uid()
      or k.responsavel = auth.uid()
      or (k.categoria = 'rh' and tem_papel('rh'))
      or (k.categoria = 'financeiro' and tem_papel('financeiro'))
      or (k.categoria = 'manutencao' and tem_papel('manutencao'))
      or (k.categoria = 'compras' and tem_papel('compras'))
      or (k.categoria = 'marketing' and tem_papel('marketing'))
      or (k.categoria <> 'rh' and (tem_papel('ti') or pode_ver_filial(k.branch_id)))
    )
  );
$$;

alter policy tk_sel on public.tickets using (
  private.sou_admin()
  or solicitante = auth.uid()
  or responsavel = auth.uid()
  or (categoria = 'rh' and private.tem_papel('rh'))
  or (categoria = 'financeiro' and private.tem_papel('financeiro'))
  or (categoria = 'manutencao' and private.tem_papel('manutencao'))
  or (categoria = 'compras' and private.tem_papel('compras'))
  or (categoria = 'marketing' and private.tem_papel('marketing'))
  or (categoria <> 'rh' and (private.tem_papel('ti') or private.pode_ver_filial(branch_id)))
);

alter policy tk_upd on public.tickets
  using (
    private.sou_admin() or private.tem_papel('ti') or responsavel = auth.uid() or solicitante = auth.uid()
    or (categoria = 'rh' and private.tem_papel('rh'))
    or (categoria = 'financeiro' and private.tem_papel('financeiro'))
    or (categoria = 'manutencao' and private.tem_papel('manutencao'))
    or (categoria = 'compras' and private.tem_papel('compras'))
    or (categoria = 'marketing' and private.tem_papel('marketing'))
  )
  with check (
    private.sou_admin() or private.tem_papel('ti') or responsavel = auth.uid() or solicitante = auth.uid()
    or (categoria = 'rh' and private.tem_papel('rh'))
    or (categoria = 'financeiro' and private.tem_papel('financeiro'))
    or (categoria = 'manutencao' and private.tem_papel('manutencao'))
    or (categoria = 'compras' and private.tem_papel('compras'))
    or (categoria = 'marketing' and private.tem_papel('marketing'))
  );
