/** Reward tiers decided by the Rewards API. The frontend never computes these. */
export type RewardAmount = 500 | 1000 | 2000 | 8000;
export type RewardTier = 'FIRST' | 'SECOND' | 'THIRD' | 'PREMIUM';

/** Status values returned by the Rewards API (§7 — to be confirmed with provider). */
export type RewardsApiStatus =
  | 'won'
  | 'not_won'
  | 'duplicate'
  | 'rejected'
  | 'campaign_closed'
  | 'model_not_eligible';

/** POST /contest/entries request body. */
export interface ContestEntryRequest {
  name: string;
  email: string;
  phone: string;
  imei: string;
  termsAccepted: true;
  termsVersion: string;
  termsAcceptedAt?: string;
  campaignId: string;
  storeId?: string; // optional outlet identifier from ?store= (Open Question 7)
}

/** POST /contest/entries response body. */
export interface ContestEntryResponse {
  status: RewardsApiStatus;
  amount?: number;
  tier?: RewardTier;
  referenceId?: string;
  claimUrl?: string;
  message?: string;
}

export type ClaimStatus = 'pending' | 'link_ready' | 'processing' | 'paid' | 'failed' | 'expired';

export interface ClaimStatusResponse {
  status: ClaimStatus;
  amount: number;
  payoutUrl?: string;
  expiresAt?: string;
  canRequestNewLink: boolean;
  message?: string;
}

/** Form values as the user enters them. */
export interface EntryFormValue {
  name: string;
  email: string;
  phone: string;
  imei: string;
  termsAccepted: boolean;
  termsVersion?: string;
  termsAcceptedAt?: string;
}

/**
 * Normalised outcome of a submission — every API response or failure is mapped
 * into exactly one of these so the UI can handle each case distinctly (§7).
 */
export type EntryOutcome =
  | { kind: 'won'; amount: number; tier?: RewardTier; referenceId?: string; claimUrl?: string; message?: string }
  | { kind: 'not_won'; referenceId?: string; message?: string }
  | { kind: 'duplicate'; message?: string }
  | { kind: 'rejected'; message?: string }
  | { kind: 'campaign_closed'; message?: string }
  | { kind: 'model_not_eligible'; message?: string }
  | { kind: 'rate_limited'; message?: string }
  | { kind: 'network_error'; message?: string }
  | { kind: 'server_error'; message?: string };

/** Outcomes that lead to the scratch card. */
export type RevealableOutcome = Extract<EntryOutcome, { kind: 'won' }>;

export function isRevealable(o: EntryOutcome | null | undefined): o is RevealableOutcome {
  return !!o && o.kind === 'won';
}

/**
 * The only data kept after submission — enough to render the scratch card and
 * receipt. No email/phone and only a masked IMEI (§9 Security).
 */
export interface CompletedEntry {
  outcome: RevealableOutcome;
  maskedImei: string;
  firstName: string;
  revealed: boolean;
  submittedAt: string;
  claimUrl?: string;
}
