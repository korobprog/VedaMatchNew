// Типы модерации Union: блокировки и жалобы. См. docs/service-module-contract.md

export type UserReportReason =
  | 'spam'
  | 'harassment'
  | 'fake_profile'
  | 'inappropriate_content'
  | 'offline_safety'
  | 'other';

export type UserReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface CreateUserReportRequest {
  reason: UserReportReason;
  comment?: string | null;
}

export interface UserBlockDto {
  userId: string;
  name: string;
  createdAt: string;
}

export interface UserBlocksState {
  blocked: UserBlockDto[];
}

export interface AdminUserReportParticipant {
  id: string;
  name: string;
  email: string;
}

export interface AdminUserReportDto {
  id: string;
  reason: UserReportReason;
  comment: string | null;
  status: UserReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  moderatorNote: string | null;
  reporter: AdminUserReportParticipant;
  target: AdminUserReportParticipant;
  /** Сколько всего жалоб на этого пользователя — сигнал для приоритета. */
  targetReportCount: number;
}

export interface AdminUserReportsResponse {
  items: AdminUserReportDto[];
  openCount: number;
}

export interface AdminUpdateUserReportRequest {
  status: UserReportStatus;
  moderatorNote?: string | null;
}
