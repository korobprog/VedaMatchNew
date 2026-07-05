// Типы сервиса VedaMatch Union. См. docs/service-module-contract.md
import type { SpiritualStage } from './index';

export type UnionIntentionType = 'family' | 'business' | 'friendship' | 'service';

export type UnionFormat = 'online' | 'offline' | 'any';

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
}

export interface UnionRecommendation {
  user: UnionUserSummary;
  profile: Pick<
    UnionProfileDto,
    'about' | 'format' | 'relocationReady' | 'languages' | 'skills' | 'interests' | 'values'
  > & { intentions: UnionIntentionDto[] };
  compatibility: UnionCompatibility;
}
