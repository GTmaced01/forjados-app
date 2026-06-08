# Checklist PWA / Play Store — FORJADOS

## PWA

- [x] `manifest.webmanifest` configurado.
- [x] Ícones 72, 96, 144, 192 e 512 px.
- [x] Ícone maskable 512 px.
- [x] Apple Touch Icon.
- [x] Favicon.
- [x] Service Worker.
- [x] Página offline.
- [x] Banner de offline/atualização.
- [x] Imagem Open Graph para WhatsApp e redes sociais.

## Testes no celular

1. Abrir no Chrome Android.
2. Entrar com conta aprovada.
3. Testar Início, Mural, Honra, Camisas, Mais e Gerenciamento.
4. Abrir menu do Chrome e escolher **Adicionar à tela inicial**.
5. Abrir o app instalado.
6. Ativar modo avião e testar se aparece a tela offline / último conteúdo salvo.

## Link compartilhado

A imagem do link usa:

```txt
https://forjados-app.vercel.app/og-image.jpg?v=20260608-logo
```

Se o WhatsApp continuar mostrando imagem antiga, envie o link assim:

```txt
https://forjados-app.vercel.app/?v=20260608-logo
```

## Play Store / TWA

Para publicar na Play Store, ainda será necessário:

1. Criar projeto Android/TWA.
2. Definir package name, exemplo: `br.com.forjados.app`.
3. Gerar o `.aab` assinado.
4. Pegar o SHA-256 da assinatura.
5. Criar `public/.well-known/assetlinks.json` com o SHA-256 real.
6. Fazer deploy na Vercel.
7. Testar `https://forjados-app.vercel.app/.well-known/assetlinks.json`.
8. Subir o `.aab` na Play Console.

Use `public/.well-known/assetlinks.example.json` apenas como modelo. Não renomeie para `assetlinks.json` até ter o SHA-256 real.
