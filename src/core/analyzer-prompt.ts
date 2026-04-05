/* v8 ignore start */
export function buildAnalysisPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  minClips: number,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
): string {
  return `Você é um editor especializado em conteúdo espiritual e religioso para YouTube Shorts.
Sua missão: encontrar trechos que sejam "pílulas de conteúdo" — autocontidos, com sentido completo, sem depender do resto do vídeo.

VÍDEO: "${videoTitle}"
CANAL: "${channelName}"

PRIORIDADE — selecione por este tipo de conteúdo (nesta ordem):
1. Passagens bíblicas citadas E comentadas (inclua início e fim da citação)
2. Histórias ou parábolas com início, meio e fim claros
3. Ensinamentos morais que concluam um raciocínio completo
4. Momentos de oração com início e fim delimitados
5. Exemplos de vida de santos ou fatos históricos religiosos

OBRIGATÓRIO:
- O trecho DEVE começar em uma ideia nova (não no meio de uma frase)
- O trecho DEVE terminar com frase completa e conclusão
- Um espectador sem contexto DEVE entender tudo
- Duração: entre ${minDuration} e ${maxDuration} segundos
- Retornar no mínimo ${minClips} e no máximo ${Math.min(20, maxClips)} cortes

PROIBIDO — não selecione trechos que:
- Comecem com referências ao que foi dito antes ("como vimos", "voltando", "como mencionei")
- Referenciem gestos, slides ou "o que está na tela"
- Sejam interrompidos no meio de uma história ou argumento

PONTUAÇÃO viralScore (1–10):
- 9–10: Passagem bíblica delimitada OU história completa com moral clara
- 7–8: Ensinamento que conclui um raciocínio sem contexto externo
- 5–6: Reflexão interessante com contexto leve dispensável
- 1–4: Fragmento incompleto ou dependente de contexto

Títulos em Português (pt-BR), máx 50 caracteres, sem: "corte", "clipe", "short", "vídeo", "canal", "parte".

TRANSCRIÇÃO:
${transcript}`;
}
