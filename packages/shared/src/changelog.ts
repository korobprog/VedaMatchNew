// Типы публичной страницы «Версия и новости» и её admin-раздела.

export type ReleaseChangeType = 'feature' | 'fix' | 'improvement';
export type RoadmapStatus = 'planned' | 'in_progress' | 'done';
export type AnnouncementStatus = 'draft' | 'published';

// ===== Публичные DTO (уже выбранный по локали текст) =====

export interface PublicReleaseChangeDto {
  id: string;
  type: ReleaseChangeType;
  title: string;
  sortOrder: number;
}

export interface PublicReleaseDto {
  id: string;
  version: string;
  isCurrent: boolean;
  releasedAt: string;
  changes: PublicReleaseChangeDto[];
}

export interface PublicAnnouncementDto {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

export interface PublicRoadmapItemDto {
  id: string;
  title: string;
  description: string | null;
  status: RoadmapStatus;
  sortOrder: number;
}

// ===== Admin DTO (оба языка сразу — для формы редактирования) =====

export interface AdminReleaseChangeDto {
  id: string;
  type: ReleaseChangeType;
  titleRu: string;
  titleEn: string;
  sortOrder: number;
}

export interface AdminReleaseDto {
  id: string;
  version: string;
  isCurrent: boolean;
  releasedAt: string;
  changes: AdminReleaseChangeDto[];
}

export interface AdminAnnouncementDto {
  id: string;
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  status: AnnouncementStatus;
  publishedAt: string | null;
}

export interface AdminRoadmapItemDto {
  id: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  status: RoadmapStatus;
  sortOrder: number;
}

// ===== Create/Update запросы (admin) =====

export interface AdminReleaseChangeInput {
  type: ReleaseChangeType;
  titleRu: string;
  titleEn: string;
  sortOrder?: number;
}

export interface CreateReleaseRequest {
  version: string;
  releasedAt: string;
  changes: AdminReleaseChangeInput[];
}

export interface UpdateReleaseRequest {
  version?: string;
  releasedAt?: string;
  changes?: AdminReleaseChangeInput[];
}

export interface CreateAnnouncementRequest {
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  status?: AnnouncementStatus;
}

export type UpdateAnnouncementRequest = Partial<CreateAnnouncementRequest>;

export interface CreateRoadmapItemRequest {
  titleRu: string;
  titleEn: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  status?: RoadmapStatus;
  sortOrder?: number;
}

export type UpdateRoadmapItemRequest = Partial<CreateRoadmapItemRequest>;
