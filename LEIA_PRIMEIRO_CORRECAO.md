# Correção de aprovação/status - FORJADOS

Este pacote muda o app para usar novas RPCs com nomes `forjados_*_v3`, evitando conflito com funções antigas do Supabase.

## Passos

1. Suba este código no GitHub.
2. Aguarde a Vercel publicar.
3. No Supabase, abra SQL Editor.
4. Rode o arquivo:

```sql
supabase/patch-admin-rpc-v3.sql
```

5. Entre no app com usuário Admin ou Diretor aprovado.
6. Teste:
   - Início > Solicitações de acesso > Aprovar
   - Início > Solicitações de acesso > Recusar
   - Mais > Painel Admin > alterar status
   - Mais > Painel Admin > alterar cargo

## Observação

Não precisa apagar as funções antigas `admin_approve_profile`, `admin_reject_profile` ou `admin_update_profile`. O app agora usa funções novas, então evita o erro:

`cannot change return type of existing function`
