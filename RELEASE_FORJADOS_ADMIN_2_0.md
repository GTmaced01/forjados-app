# FORJADOS ADMIN 2.0 — Loja de Honra 2.0

Esta versão implementa a primeira entrega prática do FORJADOS ADMIN 2.0 focada na Loja de Honra.

## Implementado

- Cadastro de produto com várias fotos.
- Upload múltiplo de imagens no mesmo produto.
- Inclusão opcional de imagens por URL.
- Definição da foto principal do produto.
- Ajuste de enquadramento por imagem:
  - posição horizontal;
  - posição vertical.
- Cards da loja usando o enquadramento configurado pelo admin.
- Miniaturas das fotos na loja para o participante trocar a imagem principal.
- Clique na foto para abrir visualização ampliada.
- Modal com navegação entre fotos.
- Compatibilidade com produtos antigos que usavam apenas `image_url`.
- Nova tabela `points_store_product_images` no Supabase.
- SQL com políticas RLS e bucket de Storage para a Loja de Honra.
- Build validado.
- Lint validado.
- `npm audit` sem vulnerabilidades após atualização automática de dependências.

## Arquivos principais alterados

- `src/types.ts`
- `src/services/pointsStore.ts`
- `src/services/storage.ts`
- `src/views/ManagePointsStoreView.tsx`
- `src/views/PointsStoreView.tsx`
- `src/index.css`
- `supabase/loja-honra-2-0-product-images.sql`
- `supabase/migrations/20260703_loja_honra_2_0_product_images.sql`

## Como aplicar no Supabase

1. Abra o Supabase.
2. Vá em SQL Editor.
3. Rode o arquivo:

```txt
supabase/loja-honra-2-0-product-images.sql
```

4. Depois publique o front-end atualizado.

## Ordem recomendada

1. Rodar SQL no Supabase.
2. Fazer deploy do front-end no Vercel.
3. Entrar como admin ou diretor.
4. Abrir Gerenciar Loja de Honra.
5. Editar um produto antigo ou cadastrar um novo.
6. Adicionar várias fotos.
7. Ajustar o enquadramento.
8. Salvar.
9. Abrir a Loja de Honra como participante e testar o clique na foto.

## Validações realizadas

```bash
npm run build
npm run lint
npm audit --audit-level=low
```

Resultado: aprovado.

---

# FORJADOS ADMIN 2.0 — Loja de Camisas 2.0

## Implementado nesta atualização

- Menu renomeado de **Gerenciar Camisas** para **Gerenciar Loja de Camisas**.
- Cadastro de camisa com várias fotos.
- Upload múltiplo de imagens no mesmo cadastro.
- Inclusão opcional de imagem por URL.
- Definição da foto principal da camisa.
- Ajuste de enquadramento horizontal e vertical por imagem.
- Lista administrativa exibindo quantidade de fotos cadastradas.
- Loja de Camisas do participante com miniaturas por camisa.
- Clique na foto para visualização ampliada.
- Modal com navegação entre fotos.
- Compatibilidade com camisas antigas que usavam apenas `image_url`.

## SQL necessário

Rode no Supabase:

```txt
supabase/loja-camisas-2-0-shirt-images.sql
```

ou a migration equivalente:

```txt
supabase/migrations/20260703_loja_camisas_2_0_shirt_images.sql
```

Não rode os dois, pois são cópias do mesmo conteúdo.
