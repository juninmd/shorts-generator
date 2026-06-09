# Shorts Generator

Painel de controle para geração e publicação de shorts por canal, com persistência em PostgreSQL, tokens criptografados por canal e interface admin dedicada.

## Fluxo Atual

- Cluster operacional: defina `CHANNEL_FLOW_MODE=cuts` e `VITE_CHANNEL_FLOW_MODE=cuts` para bloquear runs/criaÃ§Ã£o de `quiz`; fora do cluster, `quiz` segue disponÃ­vel.
- Backend API: `pnpm start` sobe o Hono em `http://localhost:3001`.
- Admin web: `pnpm web:dev` sobe a interface Vite para gerenciar canais, focos, fontes e disparar runs.
- Banco: o control plane roda migrations automaticamente quando `ADMIN_API_TOKEN`, `DATABASE_URL` e `CONTROL_PLANE_ENCRYPTION_KEY` estão definidos.

## Variáveis Obrigatórias do Control Plane

```env
PORT=3001
DATABASE_URL=postgres://user:password@localhost:5432/shorts_generator
ADMIN_API_TOKEN=troque-este-token
ADMIN_ALLOWED_ORIGINS=http://localhost:5173
CONTROL_PLANE_ENCRYPTION_KEY=base64-da-chave-de-32-bytes
CONTROL_PLANE_ENCRYPTION_KEY_VERSION=v1
```

## Comandos Verificados

```bash
pnpm test
pnpm build
pnpm bootstrap:control-plane
pnpm --dir web run test
pnpm --dir web run build
```

## Bootstrap Local

`pnpm bootstrap:control-plane` cria um canal inicial de desenvolvimento sem gravar token em texto puro. Depois disso, abra a UI admin, salve as credenciais do canal de publicação e dispare o run pelo painel.
