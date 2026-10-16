# Testes de permissão (Etapa 11)

Executados em 13/10/2026 direto no banco, com o RLS aplicado, usando `private.teste_permissoes(uuid[])`
(migração 0013). Os usuários de teste têm e-mail `teste.*@fct.local` e senha aleatória — não conseguem
logar; existem só para estes testes. Podem ser desativados ou apagados em Administração → Usuários /
Supabase → Authentication.

Base no momento do teste: 53 unidades, 358 funcionários (todos com salário vigente), folha de
outubro/2026 gerada (358 registros), 0 chamados, 0 documentos.

| O que o papel enxerga / consegue        | RH        | TI       | Gerente F301 | Usuário F301 |
|-----------------------------------------|-----------|----------|--------------|--------------|
| Funcionários visíveis                   | 358       | 0        | 5 (só F301)  | 0            |
| Salários / salário vigente              | 358 / 358 | 0 / 0    | 0 / 0        | 0 / 0        |
| Registros de folha                      | 358       | 0        | 0            | 0            |
| Unidades (cadastro é público interno)   | 53        | 53       | 53           | 53           |
| Perfis de usuário                       | 5 (todos) | 5        | 1 (o próprio)| 1 (o próprio)|
| Auditoria                               | 0 (só admin) | 0     | 0            | 0            |
| Contagem de funcionários por unidade    | 53        | 0        | 1 (F301)     | 0            |
| Alterar salários (linhas afetadas)      | 358       | 0        | 0            | 0            |
| Alterar funcionários (linhas afetadas)  | 358       | 0        | 0            | 0            |
| Alterar unidades (linhas afetadas)      | 0 (só admin) | 0     | 0            | 0            |
| Abrir chamado em nome próprio           | permitido | permitido| permitido    | permitido    |
| Abrir chamado em nome de outro          | negado    | negado   | negado       | negado       |
| Enviar documento de funcionário         | permitido | negado   | negado       | negado       |

Conclusões:

- Salário e folha ficam restritos a Administrador e RH, inclusive para o gerente da própria unidade.
- Gerente e usuário só alcançam a própria unidade; o usuário comum não vê cadastro de funcionários.
- TI atende chamados mas não acessa dados de RH.
- Ninguém abre chamado em nome de outra pessoa; a auditoria é só do administrador.
- As telas seguem a mesma regra pelo menu (`src/lib/nav.ts`) e por `exigirAcesso()` em cada página,
  mas a barreira real é o RLS: mesmo chamando a API diretamente, os dados acima são o máximo que cada
  papel obtém.

Para repetir após mudanças nas políticas:

```sql
select jsonb_pretty(private.teste_permissoes(array[
  'd70b5bc7-2389-4360-9b39-52478f7aa14e'::uuid, -- TESTE RH
  '60d67098-e0ec-4b3c-af93-895e5aa367e5'::uuid, -- TESTE TI
  '19c3c9ff-acc6-4a72-988d-da5f9ddc92ee'::uuid, -- TESTE Gerente F301
  '2ecb6070-899b-47f9-bdbb-5176baa8fec9'::uuid  -- TESTE Usuário F301
]));
```
