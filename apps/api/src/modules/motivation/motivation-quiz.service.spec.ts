import { MotivationQuizService } from './motivation-quiz.service';

function row(id: string, locator: string | null, extra: object = {}) {
  return {
    id,
    slug: id,
    imageUrl: `https://cdn/${id}.webp`,
    attributionWork: 'Бхагавад-гита как она есть',
    attributionLocator: locator,
    quote: null,
    translations: [
      { title: id, text: `Цитата ${id}\n\nПояснение`, imageText: null },
    ],
    ...extra,
  };
}

describe('MotivationQuizService', () => {
  function service(rows: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { motivationPost: { findMany } };
    return {
      quiz: new MotivationQuizService(prisma as never),
      findMany,
    };
  }

  it('берёт только иллюстрации без напечатанного текста', async () => {
    const { quiz, findMany } = service([]);
    await quiz.round('s');
    const where = findMany.mock.calls[0][0].where;
    expect(where.captionInImage).toBe(false);
    expect(where.imageUrl).toEqual({ not: null });
    expect(where.status).toBe('published');
  });

  it('собирает раунд из постов с номером стиха и отдаёт цитату без пояснения', async () => {
    const { quiz } = service([
      row('a', '2.11'),
      row('b', '4.7'),
      row('c', null),
      row('d', '1.2.12', { attributionWork: 'Шримад-Бхагаватам' }),
    ]);
    const result = await quiz.round('seed1');
    expect(result.seed).toBe('seed1');
    expect(result.available).toBe(2);
    expect(result.questions.map((q) => q.id).sort()).toEqual(['a', 'b']);
    const a = result.questions.find((q) => q.id === 'a')!;
    expect(a.answer).toBe('2.11');
    expect(a.options).toHaveLength(4);
    expect(a.text).toBe('Цитата a');
  });

  it('без семени заводит новое', async () => {
    const { quiz } = service([]);
    const result = await quiz.round(undefined);
    expect(result.seed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.questions).toEqual([]);
  });
});
