/** Passagens de narrativa completa (começo, meio e fim), para o short bíblico diário sem escolha manual. */
export const DAILY_PASSAGES = [
  "Lucas 15,11-24", "Lucas 10,25-37", "Mateus 14,22-33", "João 4,5-26", "Lucas 19,1-10", "Marcos 4,35-41",
  "João 11,17-44", "Lucas 7,11-17", "Mateus 18,21-35", "Lucas 18,9-14", "Marcos 10,46-52", "Mateus 13,3-23",
  "Lucas 24,13-35", "João 8,1-11", "Mateus 25,14-30", "Lucas 5,1-11", "Marcos 2,1-12", "João 9,1-38",
  "Lucas 1,26-38", "Mateus 2,1-12", "Lucas 17,11-19", "Mateus 20,1-16", "Lucas 12,13-21", "João 20,24-29",
  "Marcos 5,21-43", "Lucas 14,15-24", "Mateus 8,5-13", "João 6,1-14", "Lucas 16,19-31", "Mateus 7,24-27",
] as const;

/** Uma passagem por dia, rotacionando a lista (determinístico: reexecutar no mesmo dia repete a escolha). */
export function pickDailyPassage(date: Date): string {
  const day = Math.floor(date.getTime() / 86_400_000);
  return DAILY_PASSAGES[day % DAILY_PASSAGES.length]!;
}
