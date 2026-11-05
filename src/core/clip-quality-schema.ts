import { z } from "zod";

const probability = z.number().min(0).max(1);

/** Independent yes/no judgments (probability of "yes"); one failing check rejects the clip. */
const ChecksSchema = z.object({
  selfContained: probability,
  completeEnding: probability,
  logicalFlow: probability,
  titleSupported: probability,
  notSponsored: probability,
}).partial();

export const ReviewSchema = z.object({
  reviews: z.array(z.object({
    candidateIndex: z.number().int().nonnegative(),
    editorialScore: z.number().min(1).max(10),
    hookScore: z.number().min(1).max(10),
    standaloneScore: z.number().min(1).max(10),
    payoffScore: z.number().min(1).max(10),
    checks: ChecksSchema.optional(),
    approved: z.boolean(),
    reason: z.string(),
  })),
});

export type Review = z.infer<typeof ReviewSchema>["reviews"][number];

/** Every check is judged on its own bar: a good title cannot offset a bad ending. */
export const CHECK_THRESHOLDS = {
  selfContained: 0.7,
  completeEnding: 0.75,
  logicalFlow: 0.7,
  titleSupported: 0.7,
  notSponsored: 0.8,
} as const;

export function failedChecks(review: Review): string[] {
  const checks = review.checks ?? {};
  return (Object.keys(CHECK_THRESHOLDS) as (keyof typeof CHECK_THRESHOLDS)[])
    .filter((name) => checks[name] !== undefined && checks[name]! < CHECK_THRESHOLDS[name]);
}

export function isApproved(review: Review, minimumScore: number): boolean {
  return review.approved
    && review.editorialScore >= minimumScore
    && review.hookScore >= 7
    && review.standaloneScore >= 7
    && review.payoffScore >= 7
    && failedChecks(review).length === 0;
}
