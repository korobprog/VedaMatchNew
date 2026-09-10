import {
  parseChapterSize,
  parseHeadings,
  parseRecipePage,
} from './gitabase-recipe-parse';

// Образец повторяет разметку gitabase, но текст в нём свой: тест проверяет
// разбор формата, а не содержимое чужой книги.
const page = `
<div class="container">
  <h4>Книга о вегетарианской кухне</h4>
  <h5>Глава 4: Блюда из бобовых</h5>
  <h4>Суп из маша</h4>
  <p>
    САДА МУНГ ДАЛ<br>
    Густой суп, который варят на каждый день.<br>
    Время приготовления: 40 минут<br>
    Количество порции: 4<br>
    2/3 стакана маша<br>
    6 стаканов (1,5 л) воды<br>
    1 чайн. ложка куркумы<br>
    2 ст. ложки топлёного масла&emsp;<br>
    1. Переберите и промойте маш.<br>
    2. Варите до мягкости.<br>
    3. Заправьте топлёным маслом.<br>
  </p>
</div>`;

describe('parseHeadings', () => {
  it('различает книгу, главу и рецепт', () => {
    expect(parseHeadings(page)).toEqual({
      book: 'Книга о вегетарианской кухне',
      chapter: 'Глава 4: Блюда из бобовых',
      recipe: 'Суп из маша',
    });
  });
});

describe('parseRecipePage', () => {
  const parsed = parseRecipePage(page);

  it('берёт название из второго заголовка', () => {
    expect(parsed?.title).toBe('Суп из маша');
  });

  it('отделяет ингредиенты от шагов по нумерации', () => {
    expect(parsed?.ingredients).toEqual([
      '2/3 стакана маша',
      '6 стаканов (1,5 л) воды',
      '1 чайн. ложка куркумы',
      '2 ст. ложки топлёного масла',
    ]);
    expect(parsed?.steps).toHaveLength(3);
  });

  it('выбрасывает служебные строки про время и порции', () => {
    const all = [...(parsed?.ingredients ?? []), ...(parsed?.steps ?? [])];
    expect(all.some((line) => line.startsWith('Время'))).toBe(false);
    expect(all.some((line) => line.startsWith('Количество'))).toBe(false);
  });

  it('название на санскрите в описание не попадает', () => {
    expect(parsed?.description).toBe(
      'Густой суп, который варят на каждый день.',
    );
  });

  it('раскрывает html-сущности и чистит хвосты', () => {
    expect(parsed?.ingredients.at(-1)).toBe('2 ст. ложки топлёного масла');
  });

  it('на странице без рецепта возвращает null, а не пустой рецепт', () => {
    expect(parseRecipePage('<h4>Книга</h4><h5>Глава</h5>')).toBeNull();
    expect(
      parseRecipePage('<h4>Книга</h4><h4>Пусто</h4><p>Просто текст</p>'),
    ).toBeNull();
  });
});

describe('parseChapterSize', () => {
  it('считает рецепты в главе по ссылкам «Текст N»', () => {
    const chapter = `<a href="4/1">Текст 1</a><a href="4/2">Текст 2</a>
      <a href="4/16">Текст 16</a>`;
    expect(parseChapterSize(chapter)).toBe(16);
  });

  it('на главе без рецептов честно отдаёт ноль', () => {
    expect(parseChapterSize('<h4>Книга</h4>')).toBe(0);
  });
});

describe('строки, которые не ингредиенты', () => {
  const withNoise = `
    <h4>Книга</h4><h5>Глава</h5><h4>Суп</h4>
    <p>
      САДА<br>
      Описание.<br>
      Количество порции: 4<br>
      2/3 стакана маша<br>
      соль по вкусу<br>
      * Указанное количество асафетиды относится только к порошковой.<br>
      Положите расщепленный горох в горячую воду и оставьте на час, чтобы он размяк.<br>
      1. Варите до мягкости.<br>
    </p>`;
  const parsed = parseRecipePage(withNoise);

  it('выбрасывает сноску издателя', () => {
    expect(parsed?.ingredients.some((line) => line.startsWith('*'))).toBe(
      false,
    );
    expect(parsed?.steps.some((line) => line.startsWith('*'))).toBe(false);
  });

  it('длинное предложение без количества считает шагом, а не продуктом', () => {
    expect(parsed?.ingredients).toEqual(['2/3 стакана маша', 'соль по вкусу']);
    expect(parsed?.steps).toHaveLength(2);
    expect(parsed?.steps[0]).toContain('Положите расщепленный горох');
  });
});

describe('рецепт, разложенный на несколько абзацев', () => {
  // Так свёрстана половина главы: продукты в первом абзаце, шаги дальше по
  // одному на абзац. Читать только первый — значит потерять способ готовки.
  const split = `
    <h4>Книга</h4><h5>Глава</h5><h4>Дал с овощами</h4>
    <p>Количество порции: 6<br>1 стакан дала<br>2 моркови<br>1. Промойте дал.</p>
    <p>2. Добавьте морковь и варите.</p>
    <p>3. Заправьте специями.<br>Подавайте горячим.</p>`;
  const parsed = parseRecipePage(split);

  it('собирает шаги из всех абзацев', () => {
    expect(parsed?.steps).toHaveLength(4);
    expect(parsed?.steps[1]).toContain('Добавьте морковь');
    expect(parsed?.steps.at(-1)).toBe('Подавайте горячим.');
  });

  it('продукты при этом не мешаются с шагами', () => {
    expect(parsed?.ingredients).toEqual(['1 стакан дала', '2 моркови']);
  });
});
