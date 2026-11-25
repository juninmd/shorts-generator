import type { AnimatedBook } from "./animated-types.js";

/** Smoke-test short for the "Antonio Code" channel: why agent harnesses need guardrails. */
export function buildAntonioCodeDemoBook(): AnimatedBook {
  return {
    id: "antonio-code-guardrails",
    title: "Agente sem guardrails pode apagar produção",
    chapters: [
      {
        id: "c1-abertura",
        title: "O risco",
        imagePath: "",
        pose: "talk",
        prop: "none",
        narrationText: "Antonio Code aqui. Hoje: por que um agente de código sem guardrails pode apagar o seu banco de produção.",
      },
      {
        id: "c2-harness",
        title: "Acesso demais",
        imagePath: "",
        pose: "point",
        prop: "warning",
        narrationText: "Um agent harness entrega ao modelo shell, arquivos e credenciais. Uma decisão errada vira um comando real.",
      },
      {
        id: "c3-destrutivo",
        title: "Um comando errado",
        imagePath: "",
        pose: "alarm",
        prop: "database",
        narrationText: "Basta um comando destrutivo, executado no ambiente errado, para perder dados que não voltam.",
      },
      {
        id: "c4-guardrails",
        title: "Guardrails",
        imagePath: "",
        pose: "typing",
        prop: "shield",
        narrationText: "Antes de liberar o agente, aplique guardrails: permissões mínimas, bloqueio de SQL destrutivo e nenhuma credencial de escrita em produção.",
      },
      {
        id: "c5-regra",
        title: "Regra de ouro",
        imagePath: "",
        pose: "talk",
        prop: "shield",
        narrationText: "Regra prática: o agente nunca acessa o banco de produção direto. Qualquer escrita exige confirmação humana.",
      },
      {
        id: "c6-cta",
        title: "Siga o canal",
        imagePath: "",
        pose: "idle",
        prop: "none",
        narrationText: "Siga o Antonio Code para mais programação sem drama.",
      },
    ],
  };
}
