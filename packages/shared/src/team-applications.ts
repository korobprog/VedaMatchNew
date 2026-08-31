// Типы заявок в команду: форма на лендинге /team, админка /admin/team-applications.

export type TeamApplicationRole =
  | 'security'
  | 'backend'
  | 'frontend'
  | 'devops'
  | 'qa'
  | 'design'
  | 'community'
  | 'mobile'
  | 'other';

export type TeamApplicationStatus =
  | 'submitted'
  | 'reviewing'
  | 'accepted'
  | 'rejected'
  | 'closed';

export interface CreateTeamApplicationRequest {
  role: TeamApplicationRole;
  /** Обязательно, если role === 'other'. */
  roleOther?: string | null;
  contactName?: string | null;
  /** Нужен хотя бы один контакт: email или telegram. */
  contactEmail?: string | null;
  contactTelegram?: string | null;
  message: string;
  portfolioUrl?: string | null;
}

export interface CreateTeamApplicationResponse {
  id: string;
  status: TeamApplicationStatus;
  createdAt: string;
}

export interface TeamApplicationDto {
  id: string;
  role: TeamApplicationRole;
  roleOther: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTelegram: string | null;
  message: string;
  portfolioUrl: string | null;
  status: TeamApplicationStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTeamApplicationListResponse {
  items: TeamApplicationDto[];
  newCount: number;
}

export interface AdminUpdateTeamApplicationRequest {
  status?: TeamApplicationStatus;
  adminNote?: string | null;
}
