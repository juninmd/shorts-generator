/** Regex lists scoring how punchy a hook/payoff sounds; niche vocabulary is opt-out and extensible. */
export interface ImpactProfile {
  impact: RegExp[];
  weakStarts: RegExp[];
}

const GENERIC: ImpactProfile = {
  impact: [
    /\bverdade\b/, /\bn[aã]o posso\b/, /\bser[aá] que\b/, /\bego\b/,
    /\bmedo\b/, /\b[oó]di/, /\bnunca\b/, /\bsegredo\b/,
  ],
  weakStarts: [
    /\bol[aá]\b/, /\bhoje eu (quero|vou) falar\b/, /\bescreva .*coment[aá]rio/,
    /\bcompartilh/, /\binscrev/,
  ],
};

const SPIRITUAL: ImpactProfile = {
  impact: [/\blibert/, /\bsalv/, /\bcur/, /\bporta estreita\b/, /\bcruz\b/, /\bperseg/],
  weakStarts: [/\bessa palavra [eé] importante\b/, /\bem nome do pai\b/],
};

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fromEnv(name: string): RegExp[] {
  return (process.env[name] ?? "").split(",").map((word) => word.trim()).filter(Boolean)
    .map((word) => new RegExp(`\\b${escape(word.toLowerCase())}`));
}

/** IMPACT_PROFILE=generic drops the spiritual vocabulary; IMPACT_KEYWORDS / WEAK_START_KEYWORDS add terms. */
export function activeImpactProfile(): ImpactProfile {
  const spiritual = process.env.IMPACT_PROFILE === "generic" ? { impact: [], weakStarts: [] } : SPIRITUAL;
  return {
    impact: [...GENERIC.impact, ...spiritual.impact, ...fromEnv("IMPACT_KEYWORDS")],
    weakStarts: [...GENERIC.weakStarts, ...spiritual.weakStarts, ...fromEnv("WEAK_START_KEYWORDS")],
  };
}
