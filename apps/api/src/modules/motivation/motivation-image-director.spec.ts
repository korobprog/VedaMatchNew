import {
  createImageDirection,
  selectVisualStyle,
} from './motivation-image-director';

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

  it('reads the tradition from the source, not only from the meaning', () => {
    // Сам смысл цитаты про плоды действий не содержит ни одного индийского
    // слова — традицию задают говорящий и книга.
    const input = {
      meaning:
        'Кто действует, отдавая плоды Мне, тот свободен от привязанности.',
      category: 'verified_quote',
      author: 'Шри Кришна',
      work: 'Бхагавад-гита как она есть',
      locator: '9.27',
    };

    expect(selectVisualStyle(input)).toBe('indian_miniature');
    expect(createImageDirection(input).style).toBe('indian_miniature');
  });

  it('hears the speaker even when the work is unknown', () => {
    // Без автора этот смысл ушёл бы в дежурный минимализм.
    expect(
      selectVisualStyle({ meaning: 'Долг, исполненный без ожидания награды.' }),
    ).toBe('minimal_symbolism');
    expect(
      selectVisualStyle({
        meaning: 'Долг, исполненный без ожидания награды.',
        author: 'Шри Кришна',
      }),
    ).toBe('spiritual_watercolor');
  });

  it('puts the speaker, the work, the locator and the context into the prompt', () => {
    const direction = createImageDirection({
      meaning:
        'Кто действует, отдавая плоды Мне, тот свободен от привязанности.',
      category: 'verified_quote',
      author: 'Шри Кришна',
      work: 'Бхагавад-гита как она есть',
      locator: '9.27',
      contextExcerpt:
        'Кришна говорит Арджуне  на поле битвы\nо посвящении плодов труда.',
    });

    expect(direction.prompt).toContain('spoken by Шри Кришна');
    expect(direction.prompt).toContain('in «Бхагавад-гита как она есть», 9.27');
    // Переносы и двойные пробелы контекста схлопнуты — модель читает одну строку.
    expect(direction.prompt).toContain(
      'Verified context around the passage: Кришна говорит Арджуне на поле битвы о посвящении плодов труда.',
    );
    expect(direction.prompt).toContain('inside the world of that source');
    expect(direction.prompt).toContain('Read figurative wording as metaphor');
  });

  it('omits the source sentence when nothing is known about the origin', () => {
    const direction = createImageDirection({
      meaning: 'Терпение в трудный день.',
    });

    expect(direction.prompt).not.toContain('The passage is');
    expect(direction.prompt).not.toContain('Verified context');
    expect(direction.prompt).not.toContain('that source');
  });

  it('honors an approved override and builds a safe image prompt', () => {
    const direction = createImageDirection(
      {
        meaning: 'Quiet service offered with compassion.',
        category: 'verified_quote',
        author: 'A real person',
        profileTypes: ['devotee'],
      },
      'warm_documentary',
    );

    expect(direction.style).toBe('warm_documentary');
    expect(direction.prompt).toContain('vertical 9:16');
    expect(direction.prompt).toContain('no text');
    expect(direction.prompt).toContain('no logos');
    expect(direction.prompt).toContain('respectful and non-sectarian');
    expect(direction.prompt).toContain(
      'Do not portray a recognizable likeness of a real living or historical person',
    );
    // Запрет на реальных людей не должен закрывать традиционные сюжеты.
    expect(direction.prompt).toContain(
      'A traditional depiction of a scriptural figure or a classical episode is welcome',
    );
  });

  it('rejects a style outside the approved library', () => {
    expect(() =>
      createImageDirection({ meaning: 'Hope' }, 'neon_advertising' as never),
    ).toThrow('Visual style is not approved');
  });
});

describe('кинематографические стили', () => {
  const base = { meaning: 'ценность бескорыстного действия' };

  it('открывают промпт кадром, а не словом «нарисуй»', () => {
    // Зачин задаёт регистр сильнее, чем всё описание: пока каждый промпт
    // начинался с Illustrate, модель рисовала картинку при любом стиле.
    const film = createImageDirection(base, 'cinematic_film');
    expect(film.prompt.startsWith('A photorealistic cinematic film still')).toBe(
      true,
    );
    expect(film.prompt.startsWith('Illustrate')).toBe(false);
  });

  it('рисовальные стили зачин сохраняют — они и есть иллюстрации', () => {
    const watercolor = createImageDirection(
      base,
      'spiritual_watercolor',
    );
    expect(watercolor.prompt.startsWith('Illustrate')).toBe(true);
  });

  it('несут операторские указания, а не одно прилагательное', () => {
    const film = createImageDirection(base, 'cinematic_film');
    expect(film.prompt).toContain('35mm');
    expect(film.prompt).toContain('depth of field');
  });

  it('живописный реализм остаётся живописью, а не фотографией', () => {
    // Для сцен с божествами фотореализм читается как свидетельство, а не как
    // образ, поэтому у этого стиля зачин про картину.
    const painting = createImageDirection(
      base,
      'painterly_realism',
    );
    expect(painting.prompt).toContain('oil painting');
    expect(painting.prompt).toContain('rather than a photograph');
  });

  it('все четыре доступны как одобренные стили', () => {
    for (const style of [
      'cinematic_film',
      'epic_wide',
      'night_devotional',
      'painterly_realism',
    ]) {
      expect(() => createImageDirection(base, style)).not.toThrow();
    }
  });
});

describe('подбор кинематографических стилей', () => {
  it('ночную сцену отправляет к свету лампады', () => {
    expect(
      selectVisualStyle({ meaning: 'в тишине ночи он зажёг лампаду' }),
    ).toBe('night_devotional');
  });

  it('поле битвы — в эпический план, даже если названа Гита', () => {
    // Иначе всё, где упомянута книга, уходило бы в миниатюру, включая
    // Курукшетру: примета кадра точнее приметы традиции.
    expect(
      selectVisualStyle({
        meaning: 'войско выстроилось на поле битвы',
        work: 'Бхагавад-гита как она есть',
      }),
    ).toBe('epic_wide');
  });

  it('обычную цитату из Гиты по-прежнему отдаёт миниатюре', () => {
    // Прежние правила не тронуты: то, что работало, работает так же.
    expect(
      selectVisualStyle({
        meaning: 'ценность действия определяется его целью',
        work: 'Бхагавад-гита как она есть',
      }),
    ).toBe('indian_miniature');
  });

  it('храм остаётся сильнее ночи и битвы', () => {
    expect(
      selectVisualStyle({ meaning: 'ночью в храме горела лампада' }),
    ).toBe('sacred_architecture');
  });
});
