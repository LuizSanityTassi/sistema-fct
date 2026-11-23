-- 0157 — Filial da escala sempre igual à do RH (pedido do Luiz, 23/11/2026: "as filiais têm que estar iguais").
-- Acerto feito antes por SQL (backup private.esc_colaboradores_bkp_2026_11_23_filial e private.employees_ponto_bkp_2026_11_23):
--   * 9 pessoas com loja no RH (Aucimar F011 etc.): a linha da escala foi para a filial do RH;
--   * 38 terceirizados (folha ADM/CIRLEI/RFA/TRIO): filial do PONTO = loja da escala (a folha não mudou).
-- Daqui em diante a escala não aceita ligar uma ficha do RH de outra filial (vale a filial do ponto, ponto_filial_id).
-- O gatilho do RH (t_employees_escala) continua levando a pessoa quando o RH troca a filial.
create or replace function private.esc_filial_igual_rh()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_filial uuid;
  v_codigo text;
begin
  if new.employee_id is null then return new; end if;
  select e.ponto_filial_id, b.codigo into v_filial, v_codigo
    from public.employees e join public.branches b on b.id = e.ponto_filial_id
   where e.id = new.employee_id;
  if v_filial is not null and v_filial <> new.branch_id then
    raise exception 'Essa pessoa está na filial % no RH (filial do ponto). Para ela ficar nesta escala, troque a "Filial do ponto" na ficha do RH.', v_codigo
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists t_esc_filial_igual_rh on public.esc_colaboradores;
create trigger t_esc_filial_igual_rh
  before insert or update of branch_id, employee_id on public.esc_colaboradores
  for each row execute function private.esc_filial_igual_rh();
