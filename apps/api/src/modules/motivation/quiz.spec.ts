import {
  buildQuiz,
  formatGitaRef,
  GITA_VERSE_COUNTS,
  isGitaSource,
  parseGitaRef,
  pickDistractors,
  quizCandidate,
  quizSeed,
  seededRandom,
  shuffle,
  type GitaRef,
  type QuizCandidate,
  type QuizSourcePost,
} from './quiz';

function post(overrides: Partial<QuizSourcePost> = {}): QuizSourcePost {
  return {
    id: 'p1',
    slug: 'p1',
    imageUrl: 'https://cdn/p1.webp',
    attributionWork: 'Бхагавад-гита как она есть',
    attributionLocator: '2.11',
    title: 'Мудрый не скорбит',
    text: 'Мудрые не скорбят ни о живых, ни о мёртвых.',
    quote: null,
    ...overrides,
  };
}

function candidate(id: string, ref: string): QuizCandidate {
  return {
    id,
    slug: id,
    imageUrl: `https://cdn/${id}.webp`,
    ref: parseGitaRef(ref)!,
    text: '',
  };
}

describe('Гита в подписи', () => {
  it.each([
    'Бхагавад-гита',
    'бхагавад гита как она есть',
    'Бхагавад–гита',
    'Bhagavad-gītā As It Is',
    'БГ 2.11',
  ])('узнаёт «%s»', (value) => expect(isGitaSource(value)).toBe(true));

  it.each(['Шримад-Бхагаватам', 'Упанишады', 'Нектар преданности', null])(
    'не путает с «%s»',
    (value) => expect(isGitaSource(value)).toBe(false),
  );
});

describe('номер стиха', () => {
  it.each([
    ['2.11', '2.11'],
    ['2:62', '2.62'],
    ['БГ 18.66', '18.66'],
    ['16.13–14', '16.13-14'],
    ['1.16-18', '1.16-18'],
    ['Глава 2, стих 14', '2.14'],
    ['гл. 9, текст 27', '9.27'],
  ])('«%s» → %s', (raw, expected) => {
    const ref = parseGitaRef(raw);
    expect(ref && formatGitaRef(ref)).toBe(expected);
  });

  it.each([
    ['стиха, которого нет в главе', '2.95'],
    ['главы, которой нет', '19.1'],
    ['номер «Бхагаватам»', '1.2.12'],
    ['обратный диапазон', '2.14-12'],
    ['пустое', ''],
    ['просто число', 'Псалом 23'],
  ])('не принимает %s', (_label, raw) => expect(parseGitaRef(raw)).toBeNull());
});

describe('пост → вопрос', () => {
  it('иллюстрация Гиты с номером становится вопросом', () => {
    expect(quizCandidate(post())).toMatchObject({
      id: 'p1',
      imageUrl: 'https://cdn/p1.webp',
      ref: { chapter: 2, verse: 11, verseEnd: null },
    });
  });

  it('без картинки вопроса нет', () => {
    expect(quizCandidate(post({ imageUrl: null }))).toBeNull();
    expect(quizCandidate(post({ imageUrl: '  ' }))).toBeNull();
  });

  it('не Гита — не вопрос', () => {
    expect(
      quizCandidate(
        post({
          attributionWork: 'Шримад-Бхагаватам',
          attributionLocator: '1.2.6',
        }),
      ),
    ).toBeNull();
  });

  it('без номера — не вопрос: угадывать не с чем', () => {
    expect(quizCandidate(post({ attributionLocator: null }))).toBeNull();
  });

  it('номер в хвосте источника, как на проде', () => {
    const found = quizCandidate(
      post({ attributionWork: 'Бхагавад-гита 4.7', attributionLocator: null }),
    );
    expect(found && formatGitaRef(found.ref)).toBe('4.7');
  });

  it('номер и книга из привязанной цитаты', () => {
    const found = quizCandidate(
      post({
        attributionWork: null,
        attributionLocator: null,
        quote: {
          work: 'Gita',
          locator: '9.22',
          vedabaseBookSlug: 'bhagavad-gita',
        },
      }),
    );
    expect(found && formatGitaRef(found.ref)).toBe('9.22');
  });

  it('длинный текст обрезается по слову', () => {
    const found = quizCandidate(post({ text: 'слово '.repeat(200) }));
    expect(found!.text.length).toBeLessThanOrEqual(601);
    expect(found!.text.endsWith('…')).toBe(true);
  });
});

describe('семя и перемешивание', () => {
  it('одно семя — одна последовательность', () => {
    const a = seededRandom('abc');
    const b = seededRandom('abc');
    const c = seededRandom('abd');
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    first.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });

  it('перемешивание не теряет и не дублирует элементы', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = shuffle(items, seededRandom('x'));
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('семя из адреса берётся, мусор заменяется новым', () => {
    expect(quizSeed('r1a', () => 'new')).toBe('r1a');
    expect(quizSeed(undefined, () => 'new')).toBe('new');
    expect(quizSeed('<script>', () => 'new')).toBe('new');
    expect(quizSeed('x'.repeat(65), () => 'new')).toBe('new');
  });
});

describe('неверные варианты', () => {
  const answer: GitaRef = { chapter: 2, verse: 11, verseEnd: null };

  it('три разных, не совпадают с ответом и существуют в Гите', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const picked = pickDistractors(answer, [], seededRandom(seed));
      const labels = picked.map(formatGitaRef);
      expect(new Set(labels).size).toBe(3);
      expect(labels).not.toContain('2.11');
      picked.forEach((ref) =>
        expect(ref.verse).toBeLessThanOrEqual(
          GITA_VERSE_COUNTS[ref.chapter - 1],
        ),
      );
    }
  });

  it('сначала берёт номера других иллюстраций', () => {
    const pool = ['3.5', '4.7', '9.22', '2.11'].map((ref) =>
      parseGitaRef(ref)!,
    );
    const labels = pickDistractors(answer, pool, seededRandom('s')).map(
      formatGitaRef,
    );
    expect([...labels].sort()).toEqual(['3.5', '4.7', '9.22']);
  });

  it('стих внутри сдвоенной шлоки-ответа неверным не бывает', () => {
    const range: GitaRef = { chapter: 1, verse: 16, verseEnd: 18 };
    const pool = ['1.17', '1.16', '1.18', '5.5'].map((ref) =>
      parseGitaRef(ref)!,
    );
    const labels = pickDistractors(range, pool, seededRandom('q')).map(
      formatGitaRef,
    );
    expect(labels).toContain('5.5');
    expect(labels).not.toEqual(expect.arrayContaining(['1.17']));
    expect(labels).toHaveLength(3);
  });
});

describe('раунд', () => {
  const candidates = [
    candidate('a', '2.11'),
    candidate('b', '2.13'),
    candidate('c', '4.7'),
    candidate('d', '9.22'),
    candidate('e', '18.66'),
    { ...candidate('f', '2.11'), imageUrl: 'https://cdn/f.webp' },
  ];

  it('у каждого вопроса четыре варианта, среди них ответ', () => {
    const quiz = buildQuiz(candidates, 'seed');
    expect(quiz.length).toBeGreaterThan(0);
    quiz.forEach((question) => {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.answer);
    });
  });

  it('один стих — один вопрос в раунде', () => {
    const answers = buildQuiz(candidates, 'seed').map((q) => q.answer);
    expect(new Set(answers).size).toBe(answers.length);
    expect(answers).toHaveLength(5);
  });

  it('по одному семени раунд тот же, по другому — иной порядок', () => {
    expect(buildQuiz(candidates, 'one')).toEqual(buildQuiz(candidates, 'one'));
    const orders = new Set(
      ['1', '2', '3', '4', '5'].map((seed) =>
        buildQuiz(candidates, seed)
          .map((q) => q.id)
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('правильный ответ стоит не всегда на одном месте', () => {
    const places = new Set(
      Array.from({ length: 20 }, (_, i) =>
        buildQuiz(candidates, `s${i}`).map((q) => q.options.indexOf(q.answer)),
      ).flat(),
    );
    expect(places.size).toBeGreaterThan(1);
  });

  it('раунд не длиннее лимита', () => {
    expect(buildQuiz(candidates, 'seed', 2)).toHaveLength(2);
  });

  it('пустой пул — пустой раунд', () => {
    expect(buildQuiz([], 'seed')).toEqual([]);
  });
});
