# FORJADOS 2.1R — publicação segura

## Entregue nesta versão

- confirmação e visualização de senha no cadastro;
- fluxo completo de recuperação e atualização de senha;
- limpeza de dados sensíveis no logout;
- remoção do cache local de perfis e tesouraria;
- aceite explícito de termos e confidencialidade;
- “Minha Jornada” renomeada para “Minha Inscrição”;
- edição ativa com valor e abertura de inscrições;
- alerta de inscrição financeira pendente na página inicial;
- comprovantes privados com URL assinada de cinco minutos;
- valores de inscrição e pedidos calculados no PostgreSQL;
- pedido de camisas e revisões financeiras por RPC transacional;
- cabeçalhos de segurança na Vercel;
- PWA revisada e projetos Capacitor para Android/iOS.

Mercado Pago não faz parte desta entrega. Nenhum token ou código de checkout foi adicionado. O pagamento manual continua ativo até a conta e o ambiente sandbox estarem disponíveis.

## Bloqueio atual

A integração Supabase disponível no workspace não aponta para o projeto usado pelo FORJADOS. Não aplique a migration em outro projeto. Conecte primeiro o projeto cujo `project_ref` é o mesmo configurado no aplicativo.

## Ordem obrigatória

1. Confirmar que o projeto Supabase conectado é o FORJADOS e criar backup.
2. Revisar as tabelas, tipos de colunas, policies e grants já existentes.
3. Executar somente `supabase/migrations/20260824_forjados_2_1r_stabilization.sql`.
4. Conferir Security Advisor e Performance Advisor.
5. Testar com contas de participante, líder, tesouraria, diretoria e admin.
6. Publicar o frontend na Vercel.
7. Validar os fluxos abaixo antes de promover para produção.

Não execute os antigos arquivos SQL da raiz de `supabase/`. As migrations versionadas são a única fonte oficial.

## Testes de aceitação

- criar conta com senhas diferentes deve falhar;
- link de recuperação deve abrir a tela de nova senha;
- logout deve remover perfil/tesouraria do armazenamento local;
- participante deve ver somente seus comprovantes;
- tesouraria deve receber URL assinada e temporária;
- valor adulterado no navegador não deve alterar inscrição ou pedido;
- pedido com estoque insuficiente deve falhar sem criar registros parciais;
- participante não deve aprovar pagamentos, ofertas ou pedidos;
- evento fechado deve impedir novo comprovante de inscrição;
- alertas e navegação devem funcionar em desktop e mobile.

## Rollout recomendado

Faça primeiro uma janela de homologação com a diretoria e tesouraria. A mudança do bucket para privado é intencional: links públicos antigos continuam registrados apenas para compatibilidade, enquanto novos uploads usam `file_path` e URL assinada.
