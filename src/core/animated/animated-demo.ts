import type { AnimatedBook } from "./animated-types.js";

/** Smoke-test short for the "Antonio Code" channel: why agent harnesses need guardrails. */
export function buildAntonioCodeDemoBook(): AnimatedBook {
  return {
    id: "antonio-code-guardrails",
    title: "Agente sem guardrails pode apagar produção",
    chapters: [
      {
        id: "c1-risco",
        title: "O risco",
        imagePath: "",
        heading: "Seu agente pode apagar produção",
        emphasis: "apagar produção",
        enter: true,
        narrationText:
          "Você deixaria um agente de IA rodar comandos direto no seu banco de produção? Sem guardrails, é isso que acontece.",
        beats: [
          { at: 0, pose: "talk", face: "neutral" },
          { cue: "agente", prop: "robot", slot: "top", pose: "point", label: "agente de IA" },
          { cue: "banco", prop: "database", id: "db", slot: "right", pose: "present", face: "worried" },
          { cue: "guardrails", pose: "shrug", face: "worried" },
        ],
      },
      {
        id: "c2-acesso",
        title: "Acesso demais",
        imagePath: "",
        heading: "Acesso demais",
        emphasis: "demais",
        narrationText:
          "Um agent harness, como o Claude Code, entrega ao modelo shell, arquivos e credenciais. Cada decisão vira um comando real.",
        beats: [
          { at: 0, pose: "explain", face: "neutral" },
          { cue: "shell", prop: "terminal", slot: "right", pose: "point", lines: ["$ claude", "> ls ./migrations", "> psql $PROD_URL"] },
          { cue: "credenciais", prop: "lock", slot: "top", pose: "think", face: "worried" },
          { cue: "comando", pose: "alarm", face: "shocked" },
        ],
      },
      {
        id: "c3-comando",
        title: "Um comando errado",
        imagePath: "",
        heading: "Um comando no lugar errado",
        emphasis: "errado",
        narrationText:
          "Basta o agente achar que está no ambiente de teste. Um DROP TABLE no banco errado, e os dados não voltam.",
        beats: [
          { at: 0, pose: "type", face: "neutral", prop: "terminal", id: "term", slot: "right", lines: ["$ psql $DATABASE_URL", "=> DROP TABLE users;"] },
          { cue: "teste", pose: "think", face: "smug" },
          { cue: "drop", set: { id: "term", state: "danger" }, prop: "database", id: "db", slot: "top", pose: "point" },
          { cue: "errado", set: { id: "db", state: "danger" }, pose: "alarm", face: "shocked" },
          { cue: "voltam", pose: "facepalm", face: "worried" },
        ],
      },
      {
        id: "c4-guardrails",
        title: "Guardrails",
        imagePath: "",
        heading: "Coloque guardrails",
        emphasis: "guardrails",
        narrationText:
          "A solução: guardrails. Permissões mínimas, credencial só de leitura em produção e bloqueio de comandos destrutivos.",
        beats: [
          { at: 0, pose: "present", face: "determined" },
          { cue: "guardrails", prop: "shield", slot: "top", label: "guardrails" },
          {
            cue: "permissoes",
            prop: "checklist",
            slot: "right",
            pose: "point",
            items: ["permissão mínima", "prod: só leitura", "bloquear DROP", "log de comandos"],
          },
          { cue: "destrutivos", pose: "thumbs", face: "happy" },
        ],
      },
      {
        id: "c5-aprovacao",
        title: "Regra de ouro",
        imagePath: "",
        heading: "Humano aprova a escrita",
        emphasis: "aprova",
        narrationText:
          "E a regra de ouro: qualquer escrita em produção passa por aprovação humana. O agente sugere, você decide.",
        beats: [
          { at: 0, pose: "talk", face: "neutral" },
          { cue: "escrita", prop: "approval", id: "ok", slot: "right", pose: "point", title: "Executar em produção?" },
          { cue: "humana", pose: "stop", face: "determined" },
          { cue: "decide", set: { id: "ok", state: "aprovar" }, pose: "thumbs", face: "happy" },
        ],
      },
      {
        id: "c6-cta",
        title: "Siga o canal",
        imagePath: "",
        heading: "Antonio Code",
        emphasis: "Code",
        narrationText: "Segue o Antonio Code para mais programação sem drama.",
        beats: [
          { at: 0, pose: "cheer", face: "happy" },
          { cue: "antonio", prop: "terminal", slot: "right", pose: "point", lines: ["$ git commit", "> deploy seguro"] },
        ],
      },
    ],
  };
}
