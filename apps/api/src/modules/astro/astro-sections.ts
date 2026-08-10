import type {
  AstroFeatureKey,
  AstroSection,
  VedicChart,
} from '@vedamatch/shared';

/**
 * Чего требует каждый раздел разбора.
 *
 * Список опять же не маркетинговый, а следует из расчёта: раздел про лагну нельзя
 * написать без лагны, а про дело и отношения — без бхав, потому что это дома
 * десятый и седьмой. Разделы, которым хватает знаков грах, работают и при
 * неизвестном времени рождения — именно они дают человеку что-то полезное сразу.
 */
const SECTION_REQUIREMENTS: Readonly<Record<AstroSection, AstroFeatureKey[]>> =
  {
    overview: ['graha_signs'],
    strengths: ['graha_signs'],
    practice: ['graha_signs'],
    moon_nakshatra: ['moon_nakshatra'],
    dasha_current: ['dasha'],
    lagna: ['lagna'],
    career: ['houses'],
    relationships: ['houses'],
  };

/** Какие возможности реально есть в построенной карте. */
export function chartFeatures(chart: VedicChart): Set<AstroFeatureKey> {
  const features = new Set<AstroFeatureKey>(['graha_signs']);
  if (chart.lagna !== null) {
    features.add('lagna');
    features.add('houses');
  }
  if (chart.timeAccuracy !== 'unknown') {
    features.add('moon_nakshatra');
  }
  if (chart.dasha !== null) {
    features.add('dasha');
  }
  return features;
}

/** Чего не хватает разделу. Пусто — раздел можно строить. */
export function missingFor(
  section: AstroSection,
  chart: VedicChart,
): AstroFeatureKey[] {
  const available = chartFeatures(chart);
  return SECTION_REQUIREMENTS[section].filter(
    (feature) => !available.has(feature),
  );
}
