# Correção Vercel - npm install

Este pacote remove referências internas do package-lock.json e usa URLs públicas do registry.npmjs.org.

Configuração recomendada na Vercel:

- Framework Preset: Vite
- Install Command: npm install
- Build Command: npm run build
- Output Directory: dist
- Node.js Version: 22.x

Se preferir usar npm ci, também deve funcionar com este package-lock corrigido.
