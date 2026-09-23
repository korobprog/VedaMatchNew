import type {
  WellnessCheckReason,
  WellnessCheckSource,
} from '@vedamatch/shared';
import type { CheckProposal, ClaimedSource } from './check-request';
import {
  compositionAgreement,
  compositionCoverage,
  differsMeaningfully,
  sameFingerprint,
  sameProductName,
} from './composition-compare';
import {
  checkFetchUrl,
  comparableUrl,
  INGREDIENTS_ON_PAGE_MIN,
  isSiteRoot,
  pageMentionsBarcode,
  SOURCE_MAX_PAGES,
  sourceSite,
} from './source-check';

/**
 * Правило доверия автопроверки (VED-384): когда карточку принимает машина,
 * когда она ждёт человека и когда отклоняется.
 *
 * Исходная посылка: вердикт «подходит» по непроверенным данным опаснее, чем
 * «не знаем». Поэтому по умолчанию карточка идёт человеку, а принимается сама
 * только когда ВСЁ сошлось:
 *
 * 1. ИИ нашёл товар и не сообщил расхождений;
 * 2. товар называют минимум два независимых сайта, которые поиск открывал на
 *    самом деле (не главные страницы), и хотя бы одну страницу наш сервер
 *    открыл сам и увидел на ней штрихкод;
 * 3. название из источников про тот же товар, что написал человек;
 * 4. состав напечатан на странице, проверенной сервером (со штрихкодом), и
 *    совпадает со снимком по словам;
 * 5. уточнённый состав находит в справочнике ровно то же, что и снимок, —
 *    то есть ни одному человеку, с любыми ограничениями, ответ не меняет.
 *
 * Отклоняется сама карточка только одна: «не еда», подтверждённое так же
 * строго, как принятие (пункт 2). Всё прочее — к человеку, с причинами.
 */

/** Ниже этого составы считаются разными (коэффициент Дайса по словам). */
export const COMPOSITION_AGREEMENT_MIN = 0.6;
/** Столько независимых сайтов должно назвать товар. */
export const MIN_INDEPENDENT_SITES = 2;

export type CheckOutcome = 'accepted' | 'refined' | 'review' | 'rejected';
export type RefinedField = 'name' | 'brand' | 'ingredients';

export interface CheckRuleInput {
  submitted: { name: string; brand: string | null; ingredientsRaw: string };
  /** `null` — ответ ИИ не разобран. */
  proposal: CheckProposal | null;
  /** Источники с уровнем доверия, выставленным сервером. */
  sources: WellnessCheckSource[];
  /** Отпечатки справочника (`catalogFingerprint`) для обоих составов. */
  catalog: { submitted: string[]; proposal: string[] };
}

export interface CheckDecision {
  outcome: CheckOutcome;
  reasons: WellnessCheckReason[];
  /** Что записать в карточку. Есть только у принятых. */
  apply: { name: string; brand: string | null; ingredientsRaw: string } | null;
  refined: RefinedField[];
}

function review(reasons: WellnessCheckReason[]): CheckDecision {
  return { outcome: 'review', reasons, apply: null, refined: [] };
}

/**
 * Подтверждения товара: страницы, которые поиск действительно открывал или
 * сервер проверил сам, без главных страниц сайтов. Возвращает, сколько
 * независимых сайтов среди них и есть ли проверенная сервером.
 */
export function productConfirmations(sources: WellnessCheckSource[]): {
  sites: number;
  verified: boolean;
} {
  const trusted = sources.filter(
    (source) =>
      (source.confirmsProduct || source.level === 'verified') &&
      source.level !== 'claimed' &&
      !isSiteRoot(source.url),
  );
  const sites = new Set(
    trusted
      .map((source) => sourceSite(source.url))
      .filter((site): site is string => Boolean(site)),
  );
  return {
    sites: sites.size,
    verified: trusted.some((source) => source.level === 'verified'),
  };
}

export function decideCheck(input: CheckRuleInput): CheckDecision {
  const { proposal, submitted } = input;
  if (!proposal) return review(['ai_unreadable']);

  const confirmations = productConfirmations(input.sources);
  const strong =
    confirmations.sites >= MIN_INDEPENDENT_SITES && confirmations.verified;

  if (proposal.notFood) {
    return strong
      ? { outcome: 'rejected', reasons: ['not_food'], apply: null, refined: [] }
      : review(['not_food_unconfirmed']);
  }
  if (!proposal.found) return review(['not_found']);

  const reasons: WellnessCheckReason[] = [];
  if (proposal.conflicts.length) reasons.push('sources_conflict');

  if (confirmations.sites < MIN_INDEPENDENT_SITES) {
    reasons.push('too_few_sources');
  } else if (!confirmations.verified) {
    reasons.push('sources_unverified');
  }

  if (proposal.name && !sameProductName(submitted.name, proposal.name)) {
    reasons.push('name_mismatch');
  }

  const composition = proposal.ingredientsRaw;
  const printedOnVerifiedPage = input.sources.some(
    (source) => source.level === 'verified' && source.ingredientsOnPage,
  );
  if (!composition || !printedOnVerifiedPage) {
    reasons.push('composition_unconfirmed');
  }
  if (composition) {
    if (
      compositionAgreement(submitted.ingredientsRaw, composition) <
      COMPOSITION_AGREEMENT_MIN
    ) {
      reasons.push('composition_mismatch');
    } else if (
      !sameFingerprint(input.catalog.submitted, input.catalog.proposal)
    ) {
      reasons.push('catalog_matches_differ');
    }
  }

  if (reasons.length || !composition) return review(reasons);

  const apply = {
    name: proposal.name ?? submitted.name,
    brand: proposal.brand ?? submitted.brand,
    ingredientsRaw: composition,
  };
  const refined: RefinedField[] = [];
  if (differsMeaningfully(submitted.name, apply.name)) refined.push('name');
  if (differsMeaningfully(submitted.brand, apply.brand)) refined.push('brand');
  if (differsMeaningfully(submitted.ingredientsRaw, apply.ingredientsRaw)) {
    refined.push('ingredients');
  }
  return {
    outcome: refined.length ? 'refined' : 'accepted',
    reasons: [],
    apply,
    refined,
  };
}

/**
 * Какие из названных ИИ страниц сервер откроет сам. Не больше
 * `SOURCE_MAX_PAGES`: сначала те, где по словам ИИ есть состав, потом те, что
 * поиск действительно открывал. Главные страницы и адреса, по которым серверу
 * ходить нельзя, отбрасываются сразу.
 */
export function pagesToFetch(
  claimed: ClaimedSource[],
  seenUrls: string[],
): string[] {
  const seen = new Set(seenUrls);
  const score = (source: ClaimedSource) =>
    (source.confirmsIngredients ? 4 : 0) +
    (source.confirmsProduct ? 2 : 0) +
    (seen.has(comparableUrl(source.url) ?? '') ? 1 : 0);
  return claimed
    .filter((source) => !isSiteRoot(source.url))
    .filter((source) => checkFetchUrl(source.url) === null)
    .map((source, index) => ({ source, index }))
    .sort((a, b) => score(b.source) - score(a.source) || a.index - b.index)
    .slice(0, SOURCE_MAX_PAGES)
    .map(({ source }) => source.url);
}

/**
 * Уровень доверия каждому источнику по тому, что сервер видел сам.
 * `pages` — текст страниц, которые сервер открыл (`null` — не открылась).
 */
export function levelSources(input: {
  claimed: ClaimedSource[];
  seenUrls: string[];
  pages: Map<string, string | null>;
  barcode: string;
  composition: string | null;
}): WellnessCheckSource[] {
  const seen = new Set(input.seenUrls);
  return input.claimed.map((source) => {
    const page = input.pages.get(source.url) ?? null;
    const verified = page !== null && pageMentionsBarcode(page, input.barcode);
    const level = verified
      ? 'verified'
      : seen.has(comparableUrl(source.url) ?? '')
        ? 'opened'
        : 'claimed';
    return {
      ...source,
      level,
      ingredientsOnPage:
        verified &&
        page !== null &&
        Boolean(input.composition) &&
        compositionCoverage(page, input.composition ?? '') >=
          INGREDIENTS_ON_PAGE_MIN,
    };
  });
}
