# FORJADOS - Atualização completa de funcionalidades

## Ordem correta

1. Suba este projeto no GitHub.
2. Aguarde a Vercel publicar.
3. No Supabase, rode o SQL:

```text
supabase/forjados-fases-completas.sql
```

## O que foi implementado

- Mensagens automáticas programadas.
- Fazer Oferta.
- Contagem regressiva para o próximo FORJADOS.
- Configuração do próximo retiro.
- Retiros participados em Minha Jornada.
- Atualização automática de participação quando pagamento de inscrição é aprovado.
- Admin pode alterar manualmente a quantidade de retiros.
- Admin pode ver ficha completa do usuário.
- Admin pode exportar ficha individual.
- Admin pode exportar planilha da equipe.
- Admin pode excluir usuários com confirmação dupla.
- Tesouraria mostra total arrecadado por inscrições, camisas e ofertas.
- Tesouraria exporta planilha geral.
- Mural mostra aniversariantes se o aniversário cair entre início e fim do retiro.
- Clique na logo leva para Minha Identidade.
- Caronas agora aceitam link clicável do local de saída.
- Líder vê apenas membros do próprio setor.
- Diretor vê todos, exceto admin.
- Admin controla tudo.
- IDs sequenciais: ADM-01 para admin e EQP-001, EQP-002... para os demais.
- Notificação pop-up para primeira notificação não lida.

## Observações

- Mensagens automáticas são processadas quando um admin/diretor abre o app. Para envio totalmente em segundo plano, depois podemos criar uma Edge Function/cron no Supabase.
- Exclusão de usuário é soft delete: o perfil fica oculto, mas não apaga a conta Auth do Supabase. Isso é mais seguro.
- Exportação em planilha é gerada como arquivo `.xls`, compatível com Excel/LibreOffice.
