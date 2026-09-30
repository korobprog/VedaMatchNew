import { ColoringInputError, parseColoring } from './coloring-input';

/* VED-683: раскраска стиха из админки. */
describe('parseColoring', () => {
  const base = {
    chapterSlug: ' 2 ',
    unitId: 'bg-2-66',
    block: 'synonymsHtml',
    spans: [
      { start: 10, end: 14, color: 'blue' },
      { start: 0, end: 5, color: 'red', extra: true },
    ],
  };

  it('упорядочивает отрезки и чистит лишнее', () => {
    expect(parseColoring(base)).toEqual({
      chapterSlug: '2',
      unitId: 'bg-2-66',
      block: 'synonymsHtml',
      spans: [
        { start: 0, end: 5, color: 'red' },
        { start: 10, end: 14, color: 'blue' },
      ],
    });
  });

  it('пустой список — снять раскраску', () => {
    expect(parseColoring({ ...base, spans: [] }).spans).toEqual([]);
  });

  it.each([
    [null],
    [{ ...base, block: 'purportHtml' }],
    [{ ...base, spans: 'x' }],
    [{ ...base, spans: [{ start: 5, end: 5, color: 'red' }] }],
    [{ ...base, spans: [{ start: 0, end: 5, color: '#ff0000' }] }],
    [
      {
        ...base,
        spans: [
          { start: 0, end: 5, color: 'red' },
          { start: 3, end: 8, color: 'blue' },
        ],
      },
    ],
    [{ ...base, unitId: '' }],
  ])('отвергает %j', (body) => {
    expect(() => parseColoring(body)).toThrow(ColoringInputError);
  });
});
