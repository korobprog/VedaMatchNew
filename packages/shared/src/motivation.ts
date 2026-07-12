export type MotivationProfileType = 'user' | 'in_goodness' | 'yogi' | 'devotee';
export type MotivationAudienceTrack = 'universal' | 'vaishnava';
export type MotivationAttributionKind = 'exact_quote' | 'faithful_paraphrase' | 'ai_reflection';
export type MotivationLanguage = 'ru' | 'en' | 'hi';

export interface MotivationPostDto {
  id: string;
  slug: string;
  contentDate: string;
  profileType: MotivationProfileType;
  audienceTrack: MotivationAudienceTrack;
  category: string;
  imageUrl: string;
  storyImageUrl: string;
  title: string;
  text: string;
  storyText: string;
  attributionKind: MotivationAttributionKind;
  attributionSpeaker: string | null;
  attributionWork: string | null;
  attributionLocator: string | null;
  attributionSourceUrl: string | null;
  sourceVerified: boolean;
  publishedAt: string;
  isFavorite: boolean;
  isViewed: boolean;
}

export interface MotivationFeedResponse { items: MotivationPostDto[]; nextCursor: string | null }
export type MotivationPostStatus = 'draft' | 'generating' | 'published' | 'failed' | 'hidden';
export interface MotivationAdminPostDto extends MotivationPostDto {
  status: MotivationPostStatus;
  generationStage: string | null;
  generationErrorCode: string | null;
  attemptCount: number;
}
export interface MotivationPreferenceDto { vaishnavaPercent: number; language: MotivationLanguage }
export interface MotivationPreferenceUpdate { vaishnavaPercent: number; language?: MotivationLanguage }
export interface MotivationAdminUpdate { hidden?: boolean; category?: string; translations?: Partial<Record<MotivationLanguage, { title: string; text: string; storyText: string }>> }
