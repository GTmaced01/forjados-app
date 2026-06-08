# Checklist PWA / Play Store - FORJADOS

## Já preparado neste pacote

- `manifest.webmanifest` configurado com nome, tema, ícones e modo standalone.
- Ícones PNG 192x192, 512x512, maskable e Apple Touch.
- `service worker` com cache do shell, fallback offline e atualização controlada.
- Tela offline (`offline.html`).
- Banner no app para avisar quando está offline ou quando existe nova versão.
- Cache local do último perfil carregado para abrir melhor em conexão instável.
- Cache do Mural da Forja já existente para leitura offline parcial.
- Ajustes mobile para safe-area, barra inferior, inputs e botões maiores.

## Testes antes de publicar como PWA

1. Subir na Vercel.
2. Abrir no Chrome Android.
3. Menu ⋮ > Adicionar à tela inicial / Instalar app.
4. Abrir o app instalado.
5. Testar login, sair, Mural, Honra, Loja de Camisas, Loja de Honra, Mais e gerenciamento.
6. Colocar o celular em modo avião e abrir novamente.
7. Confirmar que aparece aviso offline e que o Mural já carregado antes continua disponível.

## Futuro Android / Play Store

Para publicar via TWA/Android, ainda será necessário:

1. Definir package name, por exemplo: `br.com.forjados.app`.
2. Gerar o projeto Android/TWA.
3. Gerar a chave de assinatura.
4. Obter o SHA-256 da assinatura.
5. Criar `public/.well-known/assetlinks.json` com package name e SHA-256 reais.
6. Subir na Vercel e testar `https://SEU_DOMINIO/.well-known/assetlinks.json`.
7. Gerar o `.aab`.
8. Enviar para teste interno na Play Console.
9. Testar em celular real.
10. Promover para produção.

## Modelo de assetlinks.json

Troque `br.com.forjados.app` e `SHA256_DA_ASSINATURA` pelos dados reais:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "br.com.forjados.app",
      "sha256_cert_fingerprints": [
        "SHA256_DA_ASSINATURA"
      ]
    }
  }
]
```
