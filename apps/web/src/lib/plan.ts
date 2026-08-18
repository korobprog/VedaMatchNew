import { PLAN_FEATURES } from "@vedamatch/shared";

/**
 * Единый тариф платформы. Список возможностей — общий с apps/api
 * (GET /billing/plan): раньше он был скопирован сюда руками и разошёлся
 * с бэкендом по пунктуации.
 */
export const PLAN = {
  priceRub: 108,
  priceUsdt: 2,
  trialDays: 30,
  features: PLAN_FEATURES,
};
