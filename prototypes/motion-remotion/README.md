# Protótipo: motion graphics com Remotion + buscador inteligente de backgrounds

Protótipo isolado (fora de `src/` e do pnpm workspace) para gerar vídeos verticais 1080x1920
a partir de dados, sem mexer no pipeline atual.

## Composições
- `NarratedShort`: capítulos com fundo escolhido pelo buscador, transições (fade/slide), título animado,
  legenda em grupos de 4 palavras com "pop" na palavra falada, fonte Poppins ExtraBold (a mesma das legendas FFmpeg).
- `StatsReveal`: gráfico de barras animado com contagem.
- `MoodGallery`: os 6 fundos procedurais lado a lado.

## Buscador de backgrounds (`src/backgrounds/`)
Para cada capítulo:
1. **Consulta** (`scene-query.ts`, `llm-query.ts`): palavras visuais do título/narração (pt→en), clima da cena
   (`dark`, `energetic`, `calm`, `tech`, `history`, `neutral`) e `visualQuery` opcional no livro. Com `LITELLM_BASE_URL`
   + `LITELLM_KEY`, o LLM sugere 3 buscas concretas e o clima; qualquer falha volta para a heurística.
2. **Provedores** (`providers.ts`), usados conforme as chaves existentes: biblioteca própria (`BACKGROUND_DIR`, arquivos
   nomeados pelo que mostram), Pexels vídeo+foto (`PEXELS_API_KEY`), Pixabay vídeo+foto (`PIXABAY_API_KEY`), Unsplash
   (`UNSPLASH_ACCESS_KEY`).
3. **Ranking explicável** (`rank.ts`): relevância das tags, encaixe 9:16, resolução, vídeo > foto, duração ≥ cena,
   bônus para biblioteca própria e penalidade para mídia/autor já usados no vídeo. Cada nota vem com os motivos.
4. **Fallback**: sem candidato relevante, um fundo procedural animado no clima da cena (nunca um cartão chapado).

No render (`Background.tsx`): vídeo/foto vertical em tela cheia com Ken Burns; mídia horizontal ou quadrada
em blur-fill (inteira sobre uma cópia desfocada); um tom por clima unifica fontes diferentes; grão leve; scrim
em cima e embaixo para o texto ler bem.

`src/data/backgrounds.json` guarda a escolha, os motivos e 3 alternativas por cena (auditoria).

## Uso
```bash
cd prototypes/motion-remotion
npm install
npm test                                        # testes do buscador (fixtures, sem rede)
BACKGROUND_DIR=library npm run backgrounds      # escolhe fundos → src/data/backgrounds.json + public/bg/
PEXELS_API_KEY=... npm run backgrounds          # idem com banco de stock
npm run render                                  # out/*.mp4 e stills
```
`BROWSER_EXECUTABLE` aponta para um Chrome/Chromium (padrão: o Chromium do Playwright).

## Limitações
- Evidências geradas sem chave de stock: capítulos 2 e 3 usam a biblioteca local (`library/`, derivada de
  `assets/backgrounds/quiz`) e o 1 cai no procedural "history". Com `PEXELS_API_KEY` o mesmo fluxo usa stock real.
- Tempos das palavras distribuídos igualmente (sem TTS real).
- Licenças: Pexels/Pixabay permitem uso sem atribuição; Unsplash pede crédito e registro de download na produção.
  Remotion tem licença paga para empresas maiores.
