# Protótipo: motion graphics com Remotion

Protótipo isolado (fora de `src/` e fora do pnpm workspace) para testar Remotion
como gerador de vídeos vertical 1080x1920 a partir de dados, sem mexer no pipeline atual.

## Composições
- `NarratedShort`: capítulos com título animado, zoom lento (Ken Burns) e legenda em grupos de 5 palavras com destaque. Mesmo formato de dados de `ComicBook` (título + narração + duração).
- `StatsReveal`: gráfico de barras animado com contagem, para fatos/notícias.

## Uso
```bash
cd prototypes/motion-remotion
npm install
npm run render        # gera out/*.mp4 e out/*-frame.png
npm run studio        # preview interativo
```
`BROWSER_EXECUTABLE` aponta para um Chrome/Chromium (padrão: o Chromium do Playwright).

## Limitações do protótipo
- Tempos das palavras são distribuídos igualmente no capítulo; o real viria do edge-tts (`comic-tts.ts`).
- Fonte Poppins não é carregada; usa Arial como fallback.
- Sem imagens reais: fundos são gradientes (evita direitos autorais).
- Licença do Remotion: uso gratuito limitado; empresas maiores precisam de licença paga. Ver docs antes de adotar.
