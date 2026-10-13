# Sistema FCT — Gestão Empresarial Interna

Plataforma interna modular (Farmácias FCT). Começa por **RH** e **Chamados** e cresce para
financeiro, contábil, conciliação, TI, compras etc. A **filial** é a entidade central:
todo módulo referencia o mesmo registro de filial (sem duplicar CNPJ/código).

## Stack
- **Next.js (App Router) + TypeScript + React**
- **Supabase**: PostgreSQL + Auth + Storage, com **RLS** (segurança no banco, não só na tela)
- **Tailwind + shadcn/ui** (UI empresarial, densa e limpa)
- **Zod** (validação) · **Vercel** (deploy) · **GitHub** (código)

## Hierarquia
```
organization (empresa/grupo) → branch (filial · F001…) → departments / employees / tickets / …
```

## Papéis
`admin` · `rh` · `ti` · `financeiro` · `gerente` · `usuario`
Acesso garantido por **RLS** + funções no schema privado (`private.sou_admin()`, `private.pode_ver_filial()`…).
Gerente enxerga só as filiais liberadas (`user_branch_access`).

## Banco (schema `public`)
`organizations` · `branches` · `departments` · `profiles` · `user_branch_access`
`employees` · `employee_documents` · `employee_aso` · `payroll_records`
`tickets` · `ticket_comments` · `ticket_attachments` · `ticket_history` · `audit_logs`
Dinheiro em `numeric(14,2)`; exclusão **lógica** (status/ativo); PKs `uuid`.

## Como rodar
```bash
cp .env.example .env.local   # preencha com as chaves do Supabase
npm install
npm run dev
```

## Etapas
1. ✅ Arquitetura + banco (migrations + RLS)  2. Supabase client + Auth  3. Layout base
4. Empresas/Filiais  5. Funcionários  6. Documentos + ASO  7. Folha  8. Chamados
9. Auditoria  10. Dashboard  11. Testes de permissão/segurança

As migrations ficam em `supabase/migrations/`.
