# FORJADOS

Plataforma para gestão completa de retiros cristãos: pessoas, edições, inscrições, finanças, comunicação, equipes, operação e auditoria.

> “A forja não era para te destruir. Era para te transformar.”

## Stack

- React 19, TypeScript e Vite;
- Supabase (PostgreSQL, Auth, Storage, RPCs e Edge Functions);
- PWA para navegadores e instalação pela tela inicial;
- Capacitor 8 para Android e iOS;
- Vercel e GitHub Actions.

## Desenvolvimento

```bash
cp .env.example .env
npm ci
npm run dev
```

Validações obrigatórias:

```bash
npm run lint
npm run build
```

## Aplicativos móveis

Os projetos nativos ficam em `android/` e `ios/`. Depois de alterar o frontend:

```bash
npm run mobile:sync
npm run mobile:android
# macOS + Xcode:
npm run mobile:ios
```

Consulte [docs/MOBILE_ANDROID_IOS.md](docs/MOBILE_ANDROID_IOS.md) antes de gerar uma versão para loja.

## Banco de dados

As migrations oficiais ficam exclusivamente em `supabase/migrations/`. Não execute scripts legados ou cópias duplicadas. A ordem de publicação do FORJADOS 2.1R está em [docs/FORJADOS_2_1R_RELEASE.md](docs/FORJADOS_2_1R_RELEASE.md).

O lote de qualidade e desempenho 2.1R.1 está documentado em [docs/FORJADOS_2_1R1_RELEASE.md](docs/FORJADOS_2_1R1_RELEASE.md).

Nunca coloque tokens privados de gateway, `service_role`, VAPID privada ou qualquer secret em variáveis `VITE_*`.
