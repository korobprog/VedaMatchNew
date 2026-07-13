import { createImageDirection, selectVisualStyle } from './motivation-image-director';

describe('motivation image director', () => {
  it.each([
    ['devotion to Krishna and bhakti', 'spiritual_watercolor'],
    ['a sacred temple doorway at dawn', 'sacred_architecture'],
    ['wisdom from the Bhagavad Gita in an Indian setting', 'indian_miniature'],
    ['a forest, mountain and flowing river', 'cinematic_nature'],
    ['a famous person and historical speech', 'historical_editorial'],
    ['тихая молитва преданного Кришны', 'spiritual_watercolor'],
    ['рассвет над горной рекой и лесом', 'cinematic_nature'],
    ['древний храм и священная архитектура', 'sacred_architecture'],
    ['patience in an ordinary difficult moment', 'minimal_symbolism'],
  ] as const)('selects an approved style for %s', (meaning, expected) => {
    expect(selectVisualStyle({ meaning, category: meaning })).toBe(expected);
  });

  it('honors an approved override and builds a safe image prompt', () => {
    const direction = createImageDirection({
      meaning: 'Quiet service offered with compassion.',
      category: 'verified_quote',
      author: 'A real person',
      profileTypes: ['devotee'],
    }, 'warm_documentary');

    expect(direction.style).toBe('warm_documentary');
    expect(direction.prompt).toContain('vertical 9:16');
    expect(direction.prompt).toContain('no text');
    expect(direction.prompt).toContain('no logos');
    expect(direction.prompt).toContain('Do not depict a recognizable real author');
  });

  it('rejects a style outside the approved library', () => {
    expect(() => createImageDirection({ meaning: 'Hope' }, 'neon_advertising' as never)).toThrow('Visual style is not approved');
  });
});
