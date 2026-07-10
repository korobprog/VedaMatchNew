// Типы сервиса VedaMatch Union. См. docs/service-module-contract.md
import type { SpiritualStage } from './index';
import type { ProfileMessengers, ProfileSocialLinks } from './index';

export type UnionIntentionType = 'family' | 'business' | 'friendship' | 'service';

export type UnionFormat = 'online' | 'offline' | 'any';

export type UnionConnectionStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type UnionVisibilityLevel = 'everyone' | 'after_match' | 'hidden';

export interface UnionPrivacySettings {
  photo?: UnionVisibilityLevel;
  age?: UnionVisibilityLevel;
  city?: UnionVisibilityLevel;
  contacts?: UnionVisibilityLevel;
}

export interface UnionIntentionDto {
  type: UnionIntentionType;
  /** 0..100, сумма по профилю = 100 */
  weight: number;
}

export interface UnionProfileDto {
  id: string;
  userId: string;
  about: string | null;
  relocationReady: boolean;
  format: UnionFormat;
  languages: string[];
  skills: string[];
  interests: string[];
  values: string[];
  familyStatus: string | null;
  privacy: UnionPrivacySettings | null;
  isActive: boolean;
  intentions: UnionIntentionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface UnionProfileState {
  profile: UnionProfileDto | null;
}

export interface UnionProfileUpdateRequest {
  about?: string | null;
  relocationReady?: boolean;
  format?: UnionFormat;
  languages?: string[];
  skills?: string[];
  interests?: string[];
  values?: string[];
  familyStatus?: string | null;
  privacy?: UnionPrivacySettings | null;
  isActive?: boolean;
  intentions: UnionIntentionDto[];
}

export type UnionCompatibilityCriterion =
  | 'intentions'
  | 'stage'
  | 'interests'
  | 'values'
  | 'location'
  | 'format';

export interface UnionCompatibilityBreakdownItem {
  criterion: UnionCompatibilityCriterion;
  /** Вес критерия в итоговой оценке, % */
  weight: number;
  /** Оценка по критерию, 0..100 */
  score: number;
}

export interface UnionCompatibility {
  /** Итоговый процент совместимости, 0..100 */
  total: number;
  breakdown: UnionCompatibilityBreakdownItem[];
}

export interface UnionUserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  spiritualStage: SpiritualStage | null;
  contacts: UnionVisibleContacts | null;
}

export interface UnionVisibleContacts {
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
}

export interface UnionRecommendation {
  user: UnionUserSummary;
  profile: Pick<
    UnionProfileDto,
    'about' | 'format' | 'relocationReady' | 'languages' | 'skills' | 'interests' | 'values'
  > & { intentions: UnionIntentionDto[] };
  compatibility: UnionCompatibility;
  connection: UnionConnectionSummary | null;
}

export interface UnionRecommendationFilters {
  intention?: UnionIntentionType;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  stage?: SpiritualStage;
  format?: UnionFormat;
  language?: string;
  page?: number;
  pageSize?: number;
}

export interface UnionRecommendationsResponse {
  items: UnionRecommendation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UnionConnectionSummary {
  id: string;
  status: UnionConnectionStatus;
  direction: 'incoming' | 'outgoing';
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface UnionConnectionRequestDto extends UnionConnectionSummary {
  user: UnionUserSummary;
}

export interface UnionConnectionRequestsState {
  incoming: UnionConnectionRequestDto[];
  outgoing: UnionConnectionRequestDto[];
}

export interface UnionConnectionCounts {
  incomingPending: number;
}

export interface UnionCreateConnectionRequest {
  toUserId: string;
  message?: string | null;
}

export interface UnionChatMessageDto {
  id: string;
  requestId: string;
  fromUserId: string;
  body: string;
  mine: boolean;
  createdAt: string;
}

export interface UnionChatState {
  connection: UnionConnectionSummary;
  otherUser: UnionUserSummary;
  messages: UnionChatMessageDto[];
}

export interface UnionSendChatMessageRequest {
  body: string;
}
