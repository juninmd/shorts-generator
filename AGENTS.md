# 🧠 AGENTS.md - Shorts Generator Intelligence System

## 👤 AI Personas

### 1. Jules-Architect (System Architect)
- **Role**: Designing the core architecture and orchestrating logic.
- **Focus**: Scalability, process integrity, and high-level design.
- **Vibe**: Direct, analytical, and strategic.

### 2. Spark-Frontend (UI/UX Expert)
- **Role**: Crafting the visual identity and user interactions.
- **Focus**: Aesthetics, responsiveness, and accessibility.
- **Vibe**: Creative, detail-oriented, and user-focused.

### 3. Bolt-Automation (DevOps)
- **Role**: Managing CI/CD, scripts, and automation.
- **Focus**: Build pipelines, testing, and deployment.
- **Vibe**: Fast, technical, and "automation-first".

## 📜 Development Rules (Antigravity)

1. **Size Limit**: **Max 150 lines per file**.
2. **Clean Logic**: Separation of concerns enforced across all layers.
3. **Validation**: All changes require successful tests (`npm test`), linting, and smoke tests (`npm run smoke-test`).
4. **Security**: Sensitive data must be excluded from context.
5. **Source Attribution**: Every video generated from another video MUST include the original link in the YouTube description.

## 🤝 Interaction Protocol
- Follow the **Plan -> Act -> Validate** cycle for every task.
- Consult `GEMINI.md` for project-specific instructions.

## 🔑 YouTube Token Renewal

Tokens por canal ficam no PostgreSQL do cluster (`publishing_accounts`), criptografados com AES-256-GCM. O k8s secret `shorts-generator-secret` contém `CONTROL_PLANE_ENCRYPTION_KEY`, `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`, `DATABASE_URL`, `ADMIN_API_TOKEN` e `TELEGRAM_*`.

**Sintoma:** upload falha com `invalid_grant` (não confundir com crash do pod — `invalid_grant` cancela apenas o upload).

### 1. Caminho preferido — botão no Telegram (não exige acesso ao cluster)

O pipeline detecta `invalid_grant` e envia um botão **🔗 Autorizar YouTube** no Telegram do canal. Clique e escolha a conta Google **do canal**; o callback grava o novo token no banco e confirma no Telegram qual conta do YouTube foi vinculada.

- O callback é `${SERVER_PUBLIC_URL}/api/youtube/callback` e **precisa ser público**. Ele vem de um redirect do navegador (sem header `Authorization` e sem `Origin`), então não pode ficar atrás de middleware de auth — se responder `401 {"error":"Unauthorized"}`, alguma rota/middleware está interceptando-o.
- Reenviar o botão manualmente: `npx tsx scripts/send-reauth-button.ts <channelId>` (requer `SERVER_PUBLIC_URL` + config do control plane abaixo).

### 2. Gerar um refresh_token novo (por canal, localmente)

`scripts/get-youtube-token.ts` sobe um servidor em `localhost:3000/callback` e imprime o token. Exige `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` no `.env`. Use `prompt=consent`; se o Google não devolver `refresh_token`, revogue o acesso do app na conta e repita.

### 3. Gravar no cluster

`scripts/update-cluster-tokens.ts` aceita um token por canal via env e **preserva as demais contas** (Telegram/OpenRouter) do canal. Só os canais com env var preenchida são alterados.

```powershell
# Port-forward postgres
kubectl port-forward svc/postgres 5433:5432 -n databases &
Start-Sleep 3

cd D:\Solutions\pessoal\shorts-generator
# As 3 variáveis abaixo são obrigatórias (loadControlPlaneConfig):
$env:DATABASE_URL = "postgresql://postgres:<DB_PASSWORD>@localhost:5433/shorts_generator"
$env:ADMIN_API_TOKEN = "<valor do secret shorts-generator-secret → ADMIN_API_TOKEN>"
$env:CONTROL_PLANE_ENCRYPTION_KEY = "<valor do secret shorts-generator-secret → CONTROL_PLANE_ENCRYPTION_KEY>"
$env:YOUTUBE_CLIENT_ID = "<valor do secret>"
$env:YOUTUBE_CLIENT_SECRET = "<valor do secret>"

# Só os canais que você quer renovar:
$env:SANTIDADE_REFRESH_TOKEN = "1//..."
$env:QUIZ_REFRESH_TOKEN = "1//..."
$env:AKITEMQUIZ_REFRESH_TOKEN = "1//..."

npx tsx scripts/update-cluster-tokens.ts
```

> Não monte `publishingAccounts` só com a conta do YouTube: `saveBundle` apaga as contas cujo provider não está no bundle. Use `upsertPublishingAccount` (`src/core/publishing-accounts.ts`).

### 4. Validar (read-only)

```powershell
npx tsx scripts/check-youtube-identity.ts   # valida os 3 canais e mostra o canal do YouTube de cada token
```

### Canais gerenciados

| `channelId` | Nome | Tipo |
|---|---|---|
| `santidade-catolica` | Santidade Católica | cuts |
| `quiz-channel` | Quiz Channel | quiz |
| `akitemquiz` | Aki Tem Quiz | cuts |
