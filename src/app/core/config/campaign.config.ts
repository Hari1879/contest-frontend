import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface CampaignConfig {
  campaignId: string;
  title: string;
  retailerName: string;
  qualifyingModels: string[];
  contestDays: string;
  rewardTiers: number[];
  rewardsApiBaseUrl: string;
  appKey: string;
  useMockApi: boolean;
  requestTimeoutMs: number;
}

export const CAMPAIGN_CONFIG = new InjectionToken<CampaignConfig>('CAMPAIGN_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    campaignId: environment.campaignId,
    title: 'V FEST',
    retailerName: 'Contest',
    qualifyingModels: ['Y11', 'Y21'],
    contestDays: 'Monday to Sunday',
    rewardTiers: [500, 1000, 2000, 8000],
    rewardsApiBaseUrl: environment.apiUrl,
    appKey: environment.appKey,
    useMockApi: environment.useMockApi,
    requestTimeoutMs: environment.requestTimeoutMs,
  }),
});
