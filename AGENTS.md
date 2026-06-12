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

Tokens por canal ficam no PostgreSQL do cluster (`publishing_accounts`), criptografados com AES-256-GCM. O k8s secret `shorts-generator-secret` contém apenas a `CONTROL_PLANE_ENCRYPTION_KEY`.

**Sintoma:** pod falha com `invalid_grant` no upload.

### Procedimento

**1. Gerar novo refresh_token (rodar localmente, por canal):**

```powershell
# Liberar porta 3000
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess |
  ForEach-Object { Stop-Process -Id $_ -Force }

# Iniciar servidor OAuth capturando output
$outFile = "C:\Users\jr_ac\AppData\Local\Temp\yt-token-output.txt"
"" | Set-Content $outFile
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d D:\Solutions\pessoal\shorts-generator && npx tsx scripts/get-youtube-token.ts > `"$outFile`" 2>&1" -NoNewWindow -PassThru | Out-Null
Start-Sleep 6

# Abrir link OAuth no browser (fazer login com a conta do canal)
Start-Process "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload&prompt=consent&response_type=code&client_id=439580606674-vufk9e744vv3155c6kt48ncn2bikib37.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback"

# Ler token gerado
Get-Content $outFile | Select-String "REFRESH_TOKEN"
```

**2. Atualizar `scripts/update-cluster-tokens.ts`** com o novo token e rodar:

```powershell
# Port-forward postgres
kubectl port-forward svc/postgres 5433:5432 -n databases &
Start-Sleep 3

cd D:\Solutions\pessoal\shorts-generator
$env:DATABASE_URL = "postgresql://postgres:<DB_PASSWORD>@localhost:5433/shorts_generator"  # senha no k8s secret shorts-generator-secret → DATABASE_URL
npx tsx scripts/update-cluster-tokens.ts
```

**3. Validar forçando execução do cron:**

```bash
kubectl create job --from=cronjob/shorts-generator-daily token-validate -n shorts-generator
kubectl logs -f -n shorts-generator -l job-name=token-validate
```

### Canais gerenciados

| `channelId` | Nome | Tipo |
|---|---|---|
| `santidade-catolica` | Santidade Católica | cuts |
| `quiz-channel` | Quiz Channel | quiz |
| `akitemquiz` | Aki Tem Quiz | cuts |
