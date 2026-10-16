import type { PublishingAccount } from "./channel-domain.js";

/**
 * Replaces the account whose provider matches `next.provider`, preserving every
 * other provider's account.
 *
 * ChannelBundleRepository.saveBundle() deletes any publishing account whose
 * provider is missing from the bundle, so rebuilding the array as
 * `[youtubeAccount]` silently drops the channel's Telegram/OpenRouter accounts.
 * Token-rotation scripts must go through this helper instead.
 */
export function upsertPublishingAccount(
  accounts: readonly PublishingAccount[],
  next: PublishingAccount,
): PublishingAccount[] {
  return [...accounts.filter((account) => account.provider !== next.provider), next];
}
