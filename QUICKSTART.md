# Quick Start Guide

## Control Plane Atual

O produto agora é orientado por canais gerenciados em PostgreSQL. O fluxo recomendado é:

1. Subir a API em `localhost:3001`
2. Subir a UI web em `localhost:5173`
3. Criar ou bootstrapar um canal (`cuts` no cluster; `quiz` segue disponÃ­vel fora dele)
4. Salvar o refresh token criptografado pela UI admin
5. Disparar runs por canal

### Dependências Instaladas:
- ✅ Bun (v1.4+)
- ✅ Bun (v1.4.4)
- ✅ FFmpeg (v7.1.1)
- ✅ npm packages (projeto)
- ✅ npm packages (web)
- ✅ Python environment (tests/yt-download)

---

## 📁 Shorts Gerados

5 shorts foram criados em `output/` com nomes diferentes:

```
output/
├── viral-moment-daily-[ID]/
├── trending-clip-today-[ID]/
├── best-highlight-24h-[ID]/
├── top-shortcut-moment-[ID]/
└── curated-viral-shorts-[ID]/
```

Cada pasta contém:
- `config.json` - Metadados do short
- Arquivos de vídeo (gerados durante processamento)
- Arquivos de legendas
- Logs de processamento

---

## 🎯 Comandos Disponíveis

### CLI - Gerar Shorts do YouTube
```bash
# Gerar a partir de canais (defina em .env ou --channel)
bun run generate --channel "channel-id-1,channel-id-2"

# Gerar a partir de URLs específicas
bun run generate --url "https://youtube.com/watch?v=..."

# Gerar dos últimos N dias
bun run generate --days 7
```

### Servidor Web
```bash
# Iniciar servidor (localhost:3001)
bun run start

# Modo desenvolvimento com hot-reload
bun run dev
```

### Web Interface
```bash
# Desenvolvimento
bun run web:dev

# Build
bun run web:build

# Preview
bun run web:preview
```

### Testes
```bash
# Rodar testes
bun run test

# Rodar testes web
bun --cwd web run test

# Type-check
bun run typecheck

# Build sem emitir
bun run build
```

---

## ⚙️ Configuração

### Arquivo `.env`
Crie um arquivo `.env` com as variáveis do control plane:

```env
PORT=3001
DATABASE_URL=postgres://user:password@localhost:5432/shorts_generator
ADMIN_API_TOKEN=troque-este-token
ADMIN_ALLOWED_ORIGINS=http://localhost:5173
CONTROL_PLANE_ENCRYPTION_KEY=base64-da-chave-de-32-bytes
CONTROL_PLANE_ENCRYPTION_KEY_VERSION=v1
```

Para criar um canal inicial sem token em texto puro:

```bash
bun run bootstrap:control-plane
```

---

## 🔒 .gitignore

Todos os artefatos de geração estão no `.gitignore`:
- ✅ `output/` - Shorts e processamento
- ✅ `temp/` - Arquivos temporários
- ✅ `*.mp4, *.mp3, *.wav, *.webm` - Mídia
- ✅ `*.ass, *.srt` - Subtítulos
- ✅ `.env, .env.local` - Chaves secretas
- ✅ Node e cache - `node_modules/, dist/, coverage/`

---

## 🎬 Pipeline de Processamento

O aplicativo segue este fluxo:

1. **Download** - Busca vídeos do YouTube
2. **Transcription** - Transcreve com Whisper
3. **Analysis** - Identifica momentos virais via LLM
4. **Segmentation** - Corta em clips verticais
5. **Composition** - Adiciona legendas
6. **Export** - Salva em `output/`
7. **Notification** - Envia para Telegram (opcional)

---

## 📋 Próximos Passos

1. Configurar `.env` com seus canais/URLs
2. Instalar Python dependencies (se usar download nativo):
   ```bash
   cd tests/yt-download
   pip install -r pyproject.toml
   ```
3. Iniciar Ollama localmente (para LLM)
4. Executar geração:
   ```bash
   bun run generate
   ```
5. Monitorar progresso nos logs
6. Verificar shorts em `output/`

---

## 🛠️ Troubleshooting

**FFmpeg não encontrado?**
- Windows: `choco install ffmpeg`
- macOS: `brew install ffmpeg`
- Linux: `sudo apt-get install ffmpeg`

**Porta 3000 em uso?**
```env
PORT=3001
```

**Erro de permissão em output/?**
```bash
rm -rf output/temp/*
mkdir -p output/temp
```

**LLM não conecta?**
- Inicie Ollama: `ollama serve`
- Ou defina `LLM_MODEL=gpt-4` e `LLM_API_KEY`

---

**Pronto para operar o control plane. Abra a UI web e gerencie os canais por lá.**
