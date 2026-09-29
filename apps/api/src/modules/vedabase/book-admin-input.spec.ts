import { BookPatchError, parseBookPatch } from './book-admin-input';

/* VED-662: правка книги в админке Библиотеки. */
describe('parseBookPatch', () => {
  it('берёт только известные поля и чистит их', () => {
    expect(
      parseBookPatch({
        title: '  Шри Ишопанишад ',
        author: '  ',
        audienceStages: ['seeker', 'seeker', 'devotee'],
        lineages: ['iskcon'],
        blocked: true,
        extra: 'x',
      }),
    ).toEqual({
      title: 'Шри Ишопанишад',
      author: null,
      audienceStages: ['seeker', 'devotee'],
      lineages: ['iskcon'],
      blocked: true,
    });
  });

  it('пустые списки — «для всех»', () => {
    expect(parseBookPatch({ audienceStages: [], lineages: [] })).toEqual({
      audienceStages: [],
      lineages: [],
    });
  });

  it.each([
    [null],
    [{}],
    [{ title: '' }],
    [{ title: 'x'.repeat(201) }],
    [{ author: 5 }],
    [{ audienceStages: ['guru'] }],
    [{ lineages: 'iskcon' }],
    [{ lineages: ['unknown-math'] }],
    [{ blocked: 'yes' }],
  ])('отвергает %j', (body) => {
    expect(() => parseBookPatch(body)).toThrow(BookPatchError);
  });
});
