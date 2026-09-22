import { blogEditDenial, parseKeepImageIds, planBlogImages } from './blog-edit';

const own = { authorId: 'author', repostOfId: null };

describe('blogEditDenial', () => {
  it('lets the author edit their own post', () => {
    expect(
      blogEditDenial(own, { userId: 'author', isAdmin: false }),
    ).toBeNull();
  });

  // Главное правило VED-321: прятать кнопку мало, запрос обязан отлупаться.
  it('refuses a stranger who is not an admin', () => {
    expect(blogEditDenial(own, { userId: 'someone', isAdmin: false })).toBe(
      'not_your_post',
    );
  });

  it('lets an admin edit any post', () => {
    expect(blogEditDenial(own, { userId: 'admin', isAdmin: true })).toBeNull();
  });

  // Репост показывает живой оригинал, а не снимок: правка «репоста» либо
  // переписала бы чужой пост, либо развела бы карточку с оригиналом.
  it('refuses a repost even to the one who made it', () => {
    const repost = { authorId: 'author', repostOfId: 'source' };
    expect(blogEditDenial(repost, { userId: 'author', isAdmin: false })).toBe(
      'repost_not_editable',
    );
    expect(blogEditDenial(repost, { userId: 'admin', isAdmin: true })).toBe(
      'repost_not_editable',
    );
  });

  // Порядок проверок: чужому репосту отвечаем про репост, а не про чужой
  // пост, — иначе человек пойдёт просить права, которых всё равно не хватит.
  it('answers about the repost before the ownership', () => {
    expect(
      blogEditDenial(
        { authorId: 'author', repostOfId: 'source' },
        { userId: 'someone', isAdmin: false },
      ),
    ).toBe('repost_not_editable');
  });
});

describe('parseKeepImageIds', () => {
  it('reads a JSON array as is', () => {
    expect(parseKeepImageIds(['a', 'b'])).toEqual(['a', 'b']);
  });

  // multipart с одним полем отдаёт строку, с повторённым — массив строк.
  it('reads a single multipart field', () => {
    expect(parseKeepImageIds('a')).toEqual(['a']);
  });

  it('splits a comma-separated field', () => {
    expect(parseKeepImageIds('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('drops empties, duplicates and non-strings', () => {
    expect(parseKeepImageIds(['a', '', 'a', 7, null, ' '])).toEqual(['a']);
  });

  // Поля не было вовсе — правка картинок не касается. Пустой список — это
  // «убрал все», и путать эти два случая значит уносить фотографии молча
  // при правке одного текста.
  it('tells a missing field from an empty list', () => {
    expect(parseKeepImageIds(undefined)).toBeNull();
    expect(parseKeepImageIds(null)).toBeNull();
    expect(parseKeepImageIds([])).toEqual([]);
    expect(parseKeepImageIds('')).toEqual([]);
  });
});

describe('planBlogImages', () => {
  const images = [
    { id: 'one', storageKey: 'blog/1.webp' },
    { id: 'two', storageKey: 'blog/2.webp' },
    { id: 'three', storageKey: 'blog/3.webp' },
  ];

  it('keeps what was listed and removes the rest', () => {
    const plan = planBlogImages(images, ['one', 'three']);
    expect(plan.kept.map((image) => image.id)).toEqual(['one', 'three']);
    expect(plan.removed.map((image) => image.id)).toEqual(['two']);
    expect(plan.nextPosition).toBe(2);
  });

  // Перестановка на экране доезжает до ленты: позиция — поле в базе, а не
  // имя объекта в бакете, и переписывать S3 ради неё не нужно.
  it('follows the order the author sent', () => {
    const plan = planBlogImages(images, ['three', 'one', 'two']);
    expect(plan.kept.map((image) => image.id)).toEqual(['three', 'one', 'two']);
    expect(plan.removed).toEqual([]);
  });

  // Чужой или устаревший id — не ошибка формы, а гонка с чужой правкой.
  it('ignores unknown ids', () => {
    const plan = planBlogImages(images, ['one', 'gone']);
    expect(plan.kept.map((image) => image.id)).toEqual(['one']);
    expect(plan.removed.map((image) => image.id)).toEqual(['two', 'three']);
  });

  it('keeps every image when the request said nothing about them', () => {
    const plan = planBlogImages(images, null);
    expect(plan.kept).toEqual(images);
    expect(plan.removed).toEqual([]);
    expect(plan.nextPosition).toBe(3);
  });

  it('removes everything when nothing was kept', () => {
    const plan = planBlogImages(images, []);
    expect(plan.kept).toEqual([]);
    expect(plan.removed).toHaveLength(3);
    expect(plan.nextPosition).toBe(0);
  });
});
