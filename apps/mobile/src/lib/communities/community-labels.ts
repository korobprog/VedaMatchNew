import type { CommunityKind, CommunityMemberRole } from '@vedamatch/shared';

/**
 * Подписи для общин — копия `apps/web/src/components/communities/community-labels.ts`.
 * Общины — портальная инфраструктура, но контракт мобильного приложения не
 * тянет модули веба, поэтому карта продублирована здесь же, как и на сайте
 * общие хелперы не импортируются между сервисами.
 */
export const COMMUNITY_KIND_LABELS: Record<CommunityKind, string> = {
  yatra: 'Ятра',
  temple: 'Храм',
  ashram: 'Ашрам',
  nama_hatta: 'Нама-хатта',
  farm: 'Ферма, го-шала',
  club: 'Клуб',
  center: 'Центр',
  project: 'Проект',
};

/** Рядового участника («member») в строке общины отдельно не подписываем. */
export const COMMUNITY_MEMBER_ROLE_LABELS: Record<CommunityMemberRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  moderator: 'Модератор',
  member: 'Участник',
};
