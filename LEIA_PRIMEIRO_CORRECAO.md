# Correção aprovação/status - FORJADOS

## O que foi corrigido

O app ainda estava chamando as RPCs antigas do Supabase:

- `admin_approve_profile`
- `admin_reject_profile`
- `admin_update_profile`
- `admin_list_profiles`
- `admin_list_pending_access_requests`

Essas funções antigas estavam conflitando com tipos de retorno e causando os erros:

- Erro ao atualizar solicitação de acesso
- Erro ao alterar status
- cannot change return type of existing function

Agora o app chama funções novas, com nomes diferentes:

- `forjados_admin_approve_profile_v4`
- `forjados_admin_reject_profile_v4`
- `forjados_admin_update_profile_v4`
- `forjados_admin_list_profiles_v4`
- `forjados_admin_list_pending_access_requests_v4`

## Passo obrigatório no Supabase

Depois de subir o código no GitHub e a Vercel publicar, rode no Supabase:

```text
supabase/patch-admin-rpc-v4.sql
```

Não precisa apagar funções antigas. O app não depende mais delas.

## Testes que fiz no código

- `npm install` passou
- `npm run build` passou
- `npm run lint` passou

## Testes que você deve fazer no app publicado

1. Entrar como admin/diretor.
2. Ir em Início > Solicitações de acesso.
3. Aprovar um usuário pendente.
4. Recusar outro usuário pendente.
5. Ir em Mais > Painel Admin.
6. Alterar status de um usuário.
7. Alterar cargo de um usuário.
8. Testar rolagem no celular.

Se ainda der erro, abra o console ou copie a mensagem completa do erro do Supabase. Agora o app deve mostrar o erro real vindo da RPC nova.
