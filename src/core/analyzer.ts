import { generateText, generateObject } from "ai";
import { nanoid } from "nanoid";
import type { Transcript, ShortClip, TranscriptSegment, TranscriptWord, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { snapToSentenceBoundaries } from "./clip-boundary.js";
import { getMinCuts, getMaxCuts } from "./config.js";
import { createModel } from "./ai-provider.js";
import { ClipSchema, type ClipItem } from "./analyzer-schema.js";
import { formatTranscriptForLLM, analyzeInChunks, CHUNK_THRESHOLD_CHARS } from "./analyzer-chunks.js";
import { getChannelFeedback, formatFeedbackForPrompt } from "./viral-feedback.js";

export async function analyzeTranscript(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
): Promise<ShortClip[]> {
  const minCuts = config.maxClipsOverride ?? getMinCuts(transcript.duration);
  const maxCuts = config.maxClipsOverride ?? getMaxCuts(transcript.duration);
  const formatted = formatTranscriptForLLM(transcript.segments);
  logger.info(
    { videoId: transcript.videoId, minCuts, maxCuts, duration: transcript.duration, transcriptChars: formatted.length },
    "Analisando vídeo com AI Provider...",
  );

  const t0 = Date.now();
  const rawClips = formatted.length > CHUNK_THRESHOLD_CHARS
    ? await analyzeInChunks(transcript, videoTitle, channelName, config, minCuts, maxCuts, analyzeSinglePass)   
    : await analyzeSinglePass(formatted, videoTitle, channelName, config, minCuts, maxCuts);

  logger.info({ videoId: transcript.videoId, rawClips: rawClips.length }, "Raw clips from LLM before filtering");

  const result = processClips(rawClips, transcript, config, maxCuts);

  logger.info(
    { videoId: transcript.videoId, clipsFound: result.length, elapsedSec: ((Date.now() - t0) / 1000).toFixed(1) },
    "Análise concluída!",
  );

  return result;
}

// Single-pass LLM call

export async function analyzeSinglePass(
  transcript: string,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<ClipItem[]> {
  const feedback = formatFeedbackForPrompt(await getChannelFeedback(config));
  const prompt = buildAnalysisPrompt(
    transcript, videoTitle, channelName, minCuts, maxCuts,
    config.minShortDuration, config.maxShortDuration, feedback,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeoutMs ?? 300_000);

  try {
    logger.debug({ model: config.aiModel, promptLength: prompt.length }, "Enviando prompt para AI Provider (Object Mode)");

    const { object } = await generateObject({
      model: createModel(config),
      schema: ClipSchema,
      prompt,
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal,
    });

    clearTimeout(timeoutId);
    logger.debug({ aiObject: JSON.stringify(object).substring(0, 1000) }, "Objeto retornado pela IA");

    const clips = object.clips || [];
    if (clips.length === 0) {
      logger.warn("AI retornou objeto vazio ou sem clips.");
      return [];
    }

    return clips;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error({ videoTitle }, "Timeout na chamada do LLM (Object Mode)");
    } else {
      logger.error({ err, errorMessage: err instanceof Error ? err.message : String(err) }, "Falha crítica na chamada do LLM (Object Mode). Tentando fallback...");
    }
    return analyzeSinglePassFallback(transcript, videoTitle, channelName, config, minCuts, maxCuts);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function analyzeSinglePassFallback(
  transcript: string,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<ClipItem[]> {
  const feedback = formatFeedbackForPrompt(await getChannelFeedback(config));
  const prompt = buildAnalysisPrompt(
    transcript, videoTitle, channelName, minCuts, maxCuts,
    config.minShortDuration, config.maxShortDuration, feedback,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeoutMs ?? 300_000);

  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt: prompt + "\n\nIMPORTANTE: Retorne APENAS o JSON no formato solicitado, sem textos explicativos.",
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal,
    });

    clearTimeout(timeoutId);
    // Models frequently wrap JSON in ```json fences and return a top-level
    // array instead of an object. Strip fences and extract whichever of
    // array/object appears first so both shapes parse.
    const cleaned = text.replace(/```(?:json)?/gi, "").trim();
    const start = cleaned.search(/[[{]/);
    if (start === -1) return [];
    const re = cleaned[start] === "[" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
    const jsonMatch = cleaned.match(re);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const rawArray = Array.isArray(parsed)
        ? parsed
        : (parsed.clips && Array.isArray(parsed.clips) ? parsed.clips : [parsed]);
      
      return rawArray.filter((item: any) => item && typeof item === "object").map((item: any) => {
        const startTime = typeof item.startTime === "number" ? item.startTime : (typeof item.start === "number" ? item.start : 0);
        const endTime = typeof item.endTime === "number" ? item.endTime : (typeof item.end === "number" ? item.end : 0);
        return {
          ...item,
          startTime,
          endTime,
        };
      });
    }
    return [];
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    logger.error({ error: e instanceof Error ? e.message : String(e) }, "Falha no fallback do LLM");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// Prompt

function buildAnalysisPrompt(
  transcript: string,
  videoTitle: string,
  channelName: string,
  minClips: number,
  maxClips: number,
  minDuration: number,
  maxDuration: number,
  feedbackBlock = "",
): string {
  return `Você é um editor sênior de cortes virais (YouTube Shorts). Sua reputação depende de escolher POUCOS cortes excepcionais — nunca preencher quota com trechos medianos. O espectador decide em 1-2 segundos se desliza para o próximo vídeo: o gancho é tudo.

VÍDEO: "${videoTitle}"
CANAL: "${channelName}"
${feedbackBlock}
REGRA DE OURO — O GANCHO (primeiros 3 segundos):
O corte DEVE começar "in media res", direto na frase mais intrigante, emocional ou polêmica do trecho — NUNCA em saudação, contexto, transição ou introdução. Se a primeira frase não prender um desconhecido que nunca viu o canal, o corte é reprovado.

O QUE PROCURAR (nesta ordem):
1. Vulnerabilidade emocional ou história pessoal de luta/superação com a qual qualquer um se identifica
2. Frase "quotável" dita com convicção (declaração forte, verdade incômoda, opinião polêmica)
3. Revelação surpreendente ou fato contraintuitivo que gera "eu não sabia disso"
4. Sabedoria prática aplicável hoje: UM ensinamento específico, nunca resumo ou conclusão de raciocínio anterior
5. Humor genuíno ou reação inesperada

SE o conteúdo for católico/espiritual/religioso, procure (nesta ordem):
1. Testemunho ou história pessoal/de santo emocionante com detalhe surpreendente
2. Explicação de UMA passagem bíblica com aplicação direta à vida de hoje
3. Frase desafiadora/profética dita com convicção
4. Oração curta e poderosa com início e fim delimitados
5. Ensinamento moral que fecha um raciocínio completo

OBRIGATÓRIO:
- A PRIMEIRA frase do corte já é o gancho (sem aquecimento)
- A ÚLTIMA frase fecha o raciocínio (payoff) — termine EXATAMENTE quando a ideia fecha, sem enrolação após o clímax
- Um espectador sem contexto DEVE entender a mensagem principal imediatamente
- Duração ideal: 30-45 segundos (aceitável entre ${minDuration} e ${maxDuration} segundos)
- TEMAS DISTINTOS: cada corte deve abordar um momento/tema DIFERENTE do vídeo — nunca dois cortes sobre a mesma passagem ou ideia
- Cada linha da transcrição está no formato [inicio_em_segundos - fim_em_segundos] texto. Use estes segundos diretamente para startTime e endTime (ex: se o trecho começa no segmento [45.00-48.00] e termina no segmento [70.00-73.00], configure startTime=45 e endTime=73).
- Retorne no máximo ${maxClips} cortes (mínimo ${minClips} apenas se houver material à altura). É MELHOR retornar 1 corte excelente do que ${maxClips} medianos — nunca inclua um corte com nota abaixo de 7 só para completar quantidade.

PROIBIDO: não selecione trechos que:
- Comecem com referências ao que foi falado antes ("como eu disse antes", "voltando ao assunto")
- Dependam de referências visuais que o espectador não conseguirá entender apenas ouvindo
- Sejam abertura, encerramento, avisos ou agradecimentos do vídeo

PONTUAÇÃO viralScore (1-10) — seja RIGOROSO, notas altas são raras:
- 10: gancho irresistível nos 3 primeiros segundos + emoção forte + payoff memorável
- 8-9: história ou revelação forte com bom gancho inicial
- 6-7: bom conteúdo, gancho apenas mediano
- 1-5: sem gancho, genérico, dependente de contexto — NÃO retorne
- BÔNUS +1: se a última frase emenda naturalmente na primeira (loop de replay)

TÍTULOS (title) em Português (pt-BR):
- ÚNICO e específico ao conteúdo falado no corte — títulos genéricos são PROIBIDOS (ex.: "Oração", "A Benção", "Conclusão", "O Poder da Fé")
- Gancho de curiosidade nos primeiros 40 caracteres; total entre 40 e 60 caracteres
- Inclua o nome de quem fala quando identificável (ex: "Frei Gilson: o que Padre Pio fazia às 4h da manhã")
- Sem as palavras: "corte", "clipe", "short", "vídeo", "canal", "parte"

HASHTAGS (hashtags): 3 a 5, específicas do tema e da pessoa (ex: #freigilson), nunca genéricas.

APRESENTADOR: identifique no título do vídeo, no nome do canal ou na própria transcrição o nome (ou sobrenome) da pessoa que está FALANDO/apresentando neste trecho e preencha o campo "presenter". Se houver mais de uma pessoa, use a que conduz o trecho. Se não for possível identificar com segurança, deixe "presenter" vazio.

TRANSCRIÇÃO:
${transcript}`;
}
const normalizeTitle = (title: string): string =>
  title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function processClips(clips: ClipItem[], transcript: Transcript, config: PipelineConfig, maxCuts: number): ShortClip[] {
  const filtered = clips.filter((clip) => {
    const duration = clip.endTime - clip.startTime;
    const ok = duration >= config.minShortDuration &&
               duration <= config.maxShortDuration &&
               clip.startTime >= 0 &&
               clip.endTime <= transcript.duration;
    if (!ok) {
      logger.info({
        title: clip.title,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: duration.toFixed(1),
        minShortDuration: config.minShortDuration,
        maxShortDuration: config.maxShortDuration,
        transcriptDuration: transcript.duration,
      }, "Clip filtered out");
    }
    return ok;
  });
  // Publish quality gate: weak clips flood the channel and trigger YouTube's
  // mass-produced content suppression — better to skip a video than post filler.
  const minScore = config.minViralScore ?? 0;
  const scored = filtered.filter((clip) => {
    if (clip.viralScore >= minScore) return true;
    logger.info({ title: clip.title, viralScore: clip.viralScore, minScore }, "Clip below MIN_VIRAL_SCORE — dropped");
    return false;
  });
  // Near-duplicate titles across clips of the same video are a spam fingerprint.
  const seenTitles = new Set<string>();
  logger.info({ total: clips.length, afterFilter: filtered.length, afterScoreGate: scored.length }, "processClips filter result");
  return scored
    .sort((a, b) => b.viralScore - a.viralScore)
    .filter((clip) => {
      const key = normalizeTitle(clip.title);
      if (seenTitles.has(key)) {
        logger.info({ title: clip.title }, "Clip with duplicate title — dropped");
        return false;
      }
      seenTitles.add(key);
      return true;
    })
    .slice(0, maxCuts)
    .map((clip) => {
      const snapped = snapToSentenceBoundaries({ startTime: clip.startTime, endTime: clip.endTime }, transcript.segments, config);
      return {
        id: nanoid(10),
        videoId: transcript.videoId,
        title: clip.title,
        presenter: clip.presenter?.trim() || undefined,
        description: clip.description,
        startTime: snapped.startTime,
        endTime: snapped.endTime,
        duration: snapped.endTime - snapped.startTime,
        viralScore: clip.viralScore,
        reason: clip.reason,
        transcript: getSegmentsInRange(transcript.segments, snapped.startTime, snapped.endTime),
        words: getWordsInRange(transcript.words, snapped.startTime, snapped.endTime),
        hashtags: clip.hashtags,
      };
    });
}

function getSegmentsInRange(segments: TranscriptSegment[], start: number, end: number): TranscriptSegment[] {   
  return segments
    .filter((seg) => seg.start >= start - 0.5 && seg.end <= end + 0.5)
    .map((seg) => ({ start: Math.max(0, seg.start - start), end: seg.end - start, text: seg.text }));
}

function getWordsInRange(words: TranscriptWord[], start: number, end: number): TranscriptWord[] {
  return words
    .filter((w) => w.start >= start - 0.1 && w.end <= end + 0.1)
    .map((w) => ({ word: w.word, start: Math.max(0, w.start - start), end: w.end - start }));
}
