import type {
  TeamApplicationRole,
  TeamApplicationStatus,
} from "@vedamatch/shared";

export const teamRoles: TeamApplicationRole[] = [
  "security",
  "backend",
  "frontend",
  "devops",
  "qa",
  "design",
  "community",
  "mobile",
  "other",
];

export const teamRoleLabels: Record<TeamApplicationRole, string> = {
  security: "Специалист по безопасности",
  backend: "Backend-разработчик (NestJS/Prisma)",
  frontend: "Frontend-разработчик (Next.js/React)",
  devops: "DevOps/SRE",
  qa: "QA / test automation",
  design: "UI/UX-дизайнер",
  community: "Community/контент-менеджер",
  mobile: "Mobile/PWA-оптимизация под Android",
  other: "Другое",
};

export const teamRoleDescriptions: Record<TeamApplicationRole, string> = {
  security:
    "Аудит auth (RS256/JWKS), OWASP-риски веб-модулей, защита self-hosted инфраструктуры, работа с секретами и бэкапами БД.",
  backend: "Развитие сервисных модулей по контракту, миграции, фоновые воркеры.",
  frontend: "UI сервисов, PWA, доступность.",
  devops: "Dokploy, VPS, мониторинг, бэкапы, CI/CD.",
  qa: "Автотесты, регресс по сервисам портала.",
  design: "Дизайн-система на токенах, тёмная и светлая тема.",
  community: "Модерация, наполнение Vedabase/Astro/Union.",
  mobile: "Производительность интерфейса на Android.",
  other: "Своя специализация — опишите в заявке.",
};

export const teamStatusLabels: Record<TeamApplicationStatus, string> = {
  submitted: "Новая",
  reviewing: "На рассмотрении",
  accepted: "Принята",
  rejected: "Отклонена",
  closed: "Закрыта",
};

export const teamStatuses: TeamApplicationStatus[] = [
  "submitted",
  "reviewing",
  "accepted",
  "rejected",
  "closed",
];

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
