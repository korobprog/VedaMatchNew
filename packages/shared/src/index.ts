export * from './vedabase';
export * from './gitabase';
export * from './union';

export type Role = 'user' | 'admin' | 'service-admin';

export type ServiceStatus = 'active' | 'coming_soon' | 'disabled';

export type SpiritualStage = 'seeker' | 'practitioner' | 'yogi' | 'devotee';

export type PortalUseStage = Exclude<SpiritualStage, 'devotee'>;

export type DevoteeVerificationStatus =
  | 'self_identified'
  | 'awaiting_mentor'
  | 'mentor_submitted'
  | 'awaiting_admin'
  | 'confirmed'
  | 'rejected'
  | 'needs_clarification';

export type StageChangeActor = 'system' | 'user' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  avatarKey: string | null;
  homeLocation: ProfileLocation | null;
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
  role: Role;
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  lastSelfIdentificationAt: string | null;
}

export interface ProfileLocation {
  city: string;
  country?: string;
  lat: number;
  lon: number;
  displayName?: string;
}

export interface ProfileSocialLinks {
  instagram?: string;
  telegram?: string;
  x?: string;
  facebook?: string;
  linkedin?: string;
  vk?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
}

export interface ProfileMessengers {
  telegram?: string;
  whatsapp?: string;
  mx?: string;
  phone?: string;
}

export interface ProfileUpdateRequest {
  homeLocation?: ProfileLocation | null;
  socialLinks?: ProfileSocialLinks;
  messengers?: ProfileMessengers;
}

export interface GeoSearchResult extends ProfileLocation {
  type?: string;
}

export interface ServiceCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  url: string;
  status: ServiceStatus;
  category: string;
  requiresDevoteeVerification: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface SelfIdentificationAnswers {
  interest: 'beginning' | 'learning' | 'deepening' | 'devotional_service';
  regularPractice: 'none' | 'sometimes' | 'daily' | 'strict_daily';
  currentFocus: 'curiosity' | 'basic_practice' | 'deep_practice' | 'service_community';
  hasMentor: boolean;
  hasCommunity: boolean;
  hasSpiritualName: boolean;
  participatesInService: boolean;
  wantsRecommendations: boolean;
}

export interface SelfIdentificationState {
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  lastSelfIdentificationAt: string | null;
  latestAnswers: SelfIdentificationAnswers | null;
  activeMentorRequest: {
    id: string;
    token: string;
    status: DevoteeVerificationStatus;
    mentorSubmittedAt: string | null;
    createdAt: string;
  } | null;
}

export interface SelfIdentificationSubmitResult extends SelfIdentificationState {
  detectedStage: SpiritualStage;
  mentorLinkPath: string | null;
}

export interface PortalUseStageRequest {
  stage: PortalUseStage;
}

export interface StageHistoryItem {
  id: string;
  oldStage: SpiritualStage | null;
  newStage: SpiritualStage;
  actor: StageChangeActor;
  reason: string | null;
  verificationStatus: DevoteeVerificationStatus | null;
  createdAt: string;
}

export interface MentorVerificationPublicRequest {
  userName: string;
  userStage: SpiritualStage;
  status: DevoteeVerificationStatus;
  submittedAt: string | null;
}

export interface MentorVerificationSubmit {
  mentorName: string;
  phone: string;
  email: string;
  cityOrCommunity: string;
  knownDuration: string;
  knowsPersonally: boolean;
  confirmsRegularPractice: boolean;
  confirmsService: boolean;
  confirmsSpiritualName: boolean;
  confirmsCommunityConnection: boolean;
  userCharacterReference: string;
  recommendsDevoteeStatus: boolean;
  truthConsent: boolean;
}

export interface AdminVerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: DevoteeVerificationStatus;
  mentorName: string | null;
  mentorPhone: string | null;
  mentorEmail: string | null;
  cityOrCommunity: string | null;
  knownDuration: string | null;
  knowsPersonally: boolean | null;
  confirmsRegularPractice: boolean | null;
  confirmsService: boolean | null;
  confirmsSpiritualName: boolean | null;
  confirmsCommunityConnection: boolean | null;
  recommendsDevoteeStatus: boolean | null;
  userCharacterReference: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  mentorSubmittedAt: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  lastSelfIdentificationAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasMentorRequest: boolean;
  mentorRequestStatus: DevoteeVerificationStatus | null;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserProfile extends UserProfile {
  createdAt: string;
  updatedAt: string;
}

export interface AdminSelfIdentificationResponse {
  id: string;
  answers: SelfIdentificationAnswers;
  detectedStage: SpiritualStage;
  verificationStatus: DevoteeVerificationStatus | null;
  createdAt: string;
}

export interface AdminMentorVerificationRequest extends AdminVerificationRequest {
  token: string;
  adminReviewedAt: string | null;
}

export interface AdminUserDetail {
  profile: AdminUserProfile;
  availableServices: ServiceCard[];
  stageHistory: StageHistoryItem[];
  latestSelfIdentificationResponse: AdminSelfIdentificationResponse | null;
  mentorRequest: AdminMentorVerificationRequest | null;
}

export interface AdminManualStageUpdateRequest {
  spiritualStage: SpiritualStage;
  devoteeVerificationStatus?: DevoteeVerificationStatus | null;
  reason: string;
  confirmSelfChange?: boolean;
  confirmStatusDowngrade?: boolean;
}
