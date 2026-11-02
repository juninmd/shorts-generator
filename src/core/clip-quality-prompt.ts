import type { Transcript } from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";

function candidateEvidence(clips: ClipItem[], transcript: Transcript): string {
  return clips.map((clip, candidateIndex) => {
    const text = transcript.segments
      .filter((segment) => segment.end > clip.startTime && segment.start < clip.endTime)
      .map((segment) => `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text}`)
      .join("\n");
    return `CANDIDATO ${candidateIndex}
Título: ${clip.title}
Intervalo: ${clip.startTime}-${clip.endTime} (${clip.endTime - clip.startTime}s)
Gancho literal: ${clip.hookText ?? "não informado"}
Payoff literal: ${clip.payoffText ?? "não informado"}
Nota do primeiro editor: ${clip.viralScore}
TRANSCRIÇÃO EXATA:
${text}`;
  }).join("\n\n");
}

export function buildReviewPrompt(
  clips: ClipItem[],
  transcript: Transcript,
  minDuration: number,
  maxDuration: number,
  sourceBrief = "",
): string {
  return `Você é o editor-chefe que aprova cortes antes da publicação. Faça uma revisão
independente: ignore a nota do primeiro editor e julgue somente a transcrição.
${sourceBrief}
Esta é uma transcrição automática: ignore erros de transcrição, ortografia e
acentuação quando o sentido falado continuar claro. Não reduza notas por ruído
de ASR; reprove por incoerência somente quando a mensagem for incompreensível.

Reprove se qualquer critério ficar abaixo de 7:
- hookScore: a primeira frase prende em até 3 segundos, sem saudação ou introdução;
- standaloneScore: um desconhecido entende sem contexto anterior ou apoio visual;
- payoffScore: a última frase conclui a promessa; aforismo, transformação ou
  contraste final claro são payoff forte.

Responda também 5 perguntas SIM/NÃO independentes em "checks", cada uma como a
probabilidade (0 a 1) de a resposta ser SIM. Um bom título não compensa um mau corte:
- selfContained: dá para identificar o assunto e entender o ponto principal só com o trecho?
- completeEnding: o ponto principal chega a uma afirmação, resposta ou reação completa?
- logicalFlow: as frases podem ser seguidas na ordem apresentada?
- titleSupported: o título descreve fielmente o trecho, sem fatos inventados?
- notSponsored: o trecho está livre de publicidade, cupom, afiliado ou patrocínio?

editorialScore mede o conjunto. approved só pode ser true quando os três critérios
forem >= 7 e editorialScore >= 7. Não aprove quantidade por quota. Use exatamente
o candidateIndex recebido e devolva uma revisão para cada candidato. Reprove
intervalos fora de ${minDuration}-${maxDuration}s ou frases truncadas.

FORMATO JSON EXATO:
{"reviews":[{"candidateIndex":0,"editorialScore":8,"hookScore":8,"standaloneScore":8,"payoffScore":8,"checks":{"selfContained":0.9,"completeEnding":0.9,"logicalFlow":0.9,"titleSupported":0.9,"notSponsored":0.95},"approved":true,"reason":"Justificativa editorial curta."}]}

${candidateEvidence(clips, transcript)}`;
}
