import type { AdminChannelBundle } from "../types";

export function createDraft(): AdminChannelBundle {
  const now = new Date().toISOString();
  return {
    channel: { id: "", slug: "", name: "", description: "", status: "active", logoPath: null, watermarkText: "", channelType: "cuts", createdAt: now, updatedAt: now },
    profile: { channelId: "", videoLimit: 3, minShortDuration: 15, maxShortDuration: 59, targetShorts: 3, videoQuery: null, sortByViews: false, aiProvider: "ollama", aiModel: "cloud/auto" },
    focuses: [],
    sources: [],
    publishingAccounts: [],
  };
}

/** Retorna a mensagem do primeiro problema do passo, ou null quando o passo está pronto. */
export function validateStep(draft: AdminChannelBundle, step: number): string | null {
  if (step === 1) {
    if (!draft.channel.name.trim()) return "Dê um nome ao canal.";
    if (!/^[a-z0-9-]{3,}$/.test(draft.channel.id)) return "Use ID com letras minúsculas, números e hífens (mín. 3).";
  }
  if (step === 2 && draft.channel.channelType === "cuts" && draft.sources.length === 0) {
    return "Adicione pelo menos uma fonte de vídeo.";
  }
  if (step === 3 && draft.profile.minShortDuration >= draft.profile.maxShortDuration) {
    return "A duração mínima precisa ser menor que a máxima.";
  }
  return null;
}
