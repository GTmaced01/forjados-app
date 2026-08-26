# FORJADOS 2.1R.2 — Encerramento de segurança

Esta revisão conclui a estabilização técnica do FORJADOS 2.1R sem ativar um gateway de pagamento.

## Correções finais

- remove escrita direta na trilha de auditoria;
- impede que usuários comuns criem notificações para terceiros;
- obriga lançamentos de honra e resgates a passarem pelas RPCs transacionais;
- restringe criação, edição e exclusão de escalas à diretoria/admin;
- protege telefone, e-mail e notas internas das pessoas da escala;
- restringe upload, alteração e remoção de imagens do mural e das lojas à diretoria/admin;
- preserva a leitura pública das imagens de produtos e do mural;
- mantém comprovantes financeiros no bucket privado com URL assinada.

## Implantação

Executar apenas a migração abaixo, uma única vez pelo fluxo de migrations:

`supabase/migrations/20260825162000_forjados_2_1r2_security_closure.sql`

Não executar uma cópia duplicada pelo SQL Editor.

## Pagamentos

O envio e a análise manual de comprovantes continuam ativos. Nenhum segredo ou integração de Mercado Pago, Stone ou InfinitePay foi adicionado ao frontend. O gateway será implementado em etapa própria depois da decisão comercial.

## Aplicativos móveis

A base continua preparada para PWA, Android e iOS com Capacitor. A publicação nas lojas ainda depende das contas de desenvolvedor, certificados, assinatura dos binários, política de privacidade e formulários de revisão da Google Play e da App Store.
