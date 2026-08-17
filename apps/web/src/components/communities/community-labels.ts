import type {
  CommunityJoinPolicy,
  CommunityKind,
  CommunityMemberRole,
  CommunityMemberStatus,
} from "@vedamatch/shared";

/**
 * Подписи для общин. Общины — портальная инфраструктура, поэтому файл лежит
 * рядом с портальными компонентами и им можно пользоваться из любого сервиса.
 */

export const COMMUNITY_KIND_LABELS: Record<CommunityKind, string> = {
  yatra: "Ятра",
  temple: "Храм",
  ashram: "Ашрам",
  nama_hatta: "Нама-хатта",
  farm: "Ферма, го-шала",
  club: "Клуб",
  center: "Центр",
  project: "Проект",
};

export const COMMUNITY_KIND_ORDER: CommunityKind[] = [
  "yatra",
  "temple",
  "ashram",
  "nama_hatta",
  "farm",
  "club",
  "center",
  "project",
];

export const JOIN_POLICY_LABELS: Record<CommunityJoinPolicy, string> = {
  open: "Вступают свободно",
  request_approval: "По заявке",
  invite_only: "Только по приглашению",
};

export const MEMBER_ROLE_LABELS: Record<CommunityMemberRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  moderator: "Модератор",
  member: "Участник",
};

export const MEMBER_STATUS_LABELS: Record<CommunityMemberStatus, string> = {
  pending: "Заявка на рассмотрении",
  active: "Участник",
  declined: "Заявка отклонена",
  left: "Вышел",
  removed: "Исключён",
};
