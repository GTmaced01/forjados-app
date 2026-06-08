# Correção aprovação/status - FORJADOS V5

Esta versão para de chamar as funções antigas `admin_*` e passa a usar funções novas `forjados_admin_*_v5`.

## Passo obrigatório no Supabase

Antes de testar no app, rode no SQL Editor do Supabase:

```sql
-- arquivo: supabase/patch-admin-rpc-v5.sql
```

Depois suba este código no GitHub e aguarde a Vercel publicar.

## O que testar

- Início > Solicitações de acesso > Aprovar
- Início > Solicitações de acesso > Recusar
- Mais > Painel Admin > alterar status
- Mais > Painel Admin > alterar cargo

Se ainda aparecer erro, agora o app deve mostrar a mensagem real do Supabase com mais detalhes.
