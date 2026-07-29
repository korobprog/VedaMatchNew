import { MotivationVisualStyle } from '@prisma/client';

export type ImageDirectionInput = {
  meaning: string;
  category?: string | null;
  author?: string | null;
  work?: string | null;
  profileTypes?: string[];
};

export type ImageDirection = {
  style: MotivationVisualStyle;
  prompt: string;
};

const approvedStyles = new Set<string>(Object.values(MotivationVisualStyle));

const styleInstructions: Record<MotivationVisualStyle, string> = {
  spiritual_watercolor:
    'Soft spiritual watercolor, luminous natural pigments, gentle contemplative atmosphere.',
  cinematic_nature:
    'Cinematic symbolic nature, realistic light, atmospheric depth, emotionally restrained composition.',
  indian_miniature:
    'Refined Indian miniature-inspired illustration, intricate natural details, respectful traditional palette.',
  sacred_architecture:
    'Sacred architecture in serene natural light, balanced geometry, reverent and non-sectarian mood.',
  minimal_symbolism:
    'Minimal symbolic illustration, one clear visual metaphor, generous negative space, calm palette.',
  warm_documentary:
    'Warm documentary-style human scene, candid compassion, natural light, authentic everyday setting.',
  cosmic_contemplation:
    'Cosmic contemplative illustration, subtle celestial scale, quiet wonder, no fantasy spectacle.',
  historical_editorial:
    'Restrained historical editorial illustration, period atmosphere, archival palette, no celebrity likeness.',
};

export function selectVisualStyle(
  input: ImageDirectionInput,
): MotivationVisualStyle {
  const concepts = [
    input.meaning,
    input.category,
    input.work,
    ...(input.profileTypes ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru-RU');

  if (
    /temple|mandir|cathedral|church|mosque|sacred architecture|храм|собор|мечет/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.sacred_architecture;
  if (
    /bhagavad|gita|vedic|india|indian|upanishad|махабхарат|бхагавад|гит[аы]|инди[яй]/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.indian_miniature;
  if (
    /devot|bhakti|krishna|prayer|worship|spiritual|предан|бхакти|кришн|молитв|духовн/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.spiritual_watercolor;
  if (
    /forest|mountain|river|ocean|tree|nature|sunrise|лес|гор[аы]|рек[аи]|океан|природ|рассвет/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.cinematic_nature;
  if (
    /famous|historical|biograph|speech|great people|великие личности|известн|историческ|биограф|речь/.test(
      concepts,
    )
  )
    return MotivationVisualStyle.historical_editorial;
  return MotivationVisualStyle.minimal_symbolism;
}

export function createImageDirection(
  input: ImageDirectionInput,
  styleOverride?: MotivationVisualStyle,
): ImageDirection {
  if (styleOverride && !approvedStyles.has(styleOverride))
    throw new Error('Visual style is not approved');
  const style = styleOverride ?? selectVisualStyle(input);
  const meaning = input.meaning.replace(/\s+/g, ' ').trim().slice(0, 2_000);
  return {
    style,
    prompt: [
      `Illustrate this meaning without rendering the quotation: ${meaning}`,
      styleInstructions[style],
      'Create a vertical 9:16 composition suitable for a mobile Story.',
      'no text, no letters, no captions, no typography, no logos, no watermarks.',
      'Do not depict a recognizable real author or public figure.',
      'Avoid questionable religious iconography, visual artifacts, stereotypes, and advertising aesthetics.',
    ].join(' '),
  };
}
