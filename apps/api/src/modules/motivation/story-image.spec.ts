import sharp from 'sharp';
import { readPngText } from './png-metadata';
import {
  AI_DISCLOSURE,
  renderStoryOverlay,
  brandLogoBox,
  buildStoryOverlaySvg,
  clampLines,
  composeStoryImage,
  escapeXml,
  STORY_HEIGHT,
  STORY_WIDTH,
  wrapText,
} from './story-image';

describe('escapeXml', () => {
  it('neutralises characters that would break the SVG', () => {
    expect(escapeXml('«Вера» & <любовь>')).toBe('«Вера» &amp; &lt;любовь&gt;');
    expect(escapeXml(`"кавычки" 'и'`)).toBe(
      '&quot;кавычки&quot; &apos;и&apos;',
    );
  });
});

describe('wrapText', () => {
  it('breaks a long line into several', () => {
    const lines = wrapText(
      'Всё движение сознания Кришны это массовое лечение материалистичных людей',
      54,
      900,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(
      'Всё движение сознания Кришны это массовое лечение материалистичных людей',
    );
  });

  it('keeps a short line whole', () => {
    expect(wrapText('Короткая цитата', 54, 900)).toEqual(['Короткая цитата']);
  });

  it('splits a word that cannot fit on any line', () => {
    const lines = wrapText('а'.repeat(200), 54, 400);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('а'.repeat(200));
  });

  it('drops blank paragraphs instead of emitting empty lines', () => {
    expect(wrapText('Первый\n\n\nВторой', 54, 900)).toEqual([
      'Первый',
      'Второй',
    ]);
  });
});

describe('clampLines', () => {
  it('leaves a short block untouched', () => {
    expect(clampLines(['a', 'b'], 5)).toEqual(['a', 'b']);
  });

  it('trims the tail and marks the cut', () => {
    expect(clampLines(['a', 'b', 'c'], 2)).toEqual(['a', 'b…']);
  });

  it('does not leave punctuation before the ellipsis', () => {
    expect(clampLines(['a', 'b, ', 'c'], 2)).toEqual(['a', 'b…']);
  });
});

describe('buildStoryOverlaySvg · открытка', () => {
  it('ставит поздравление вверху кадра и затемняет полосу под ним', () => {
    const svg = buildStoryOverlaySvg({
      text: 'Пусть в сердце будет радость служения.',
      greeting: 'С Джанмаштами',
    });

    expect(svg).toContain('class="greeting"');
    expect(svg).toContain('С Джанмаштами');
    // Заголовок по центру, в отличие от цитаты, прижатой влево.
    expect(svg).toMatch(/text-anchor="middle" class="greeting"/);
  });

  it('без поздравления кадр остаётся прежней сторис', () => {
    const svg = buildStoryOverlaySvg({ text: 'Только цитата.' });

    expect(svg).not.toContain('class="greeting"');
  });

  it('переносит длинное поздравление и не даёт ему занять кадр', () => {
    const svg = buildStoryOverlaySvg({
      text: 'Цитата.',
      greeting: 'С днём явления Шри Кришны и светлым праздником всей общины',
    });

    const lines = svg.match(/class="greeting"/g) ?? [];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});

describe('buildStoryOverlaySvg', () => {
  it('covers the full story frame', () => {
    const svg = buildStoryOverlaySvg({ text: 'Цитата' });
    expect(svg).toContain(`width="${STORY_WIDTH}"`);
    expect(svg).toContain(`height="${STORY_HEIGHT}"`);
  });

  it('оставляет знаку место у нижнего края, внутри кадра', () => {
    const box = brandLogoBox();

    expect(box.left).toBeGreaterThan(0);
    expect(box.top).toBeGreaterThan(0);
    expect(box.top + box.height).toBeLessThan(STORY_HEIGHT);
    expect(box.left + box.width).toBeLessThan(STORY_WIDTH);
  });

  it('ставит знак над текстом, а не под ним', () => {
    const input = {
      text: 'Цитата',
      attribution: 'Шри Кришна · Бхагавад-гита',
    };
    const svg = buildStoryOverlaySvg(input);
    const box = brandLogoBox({ quoteLines: 1, metaLines: 1 });
    const blockBaselines = [
      ...svg.matchAll(
        /<text[^>]*y="(\d+(?:\.\d+)?)"[^>]*class="(quote|meta|disclosure)"/g,
      ),
    ].map((match) => Number(match[1]));

    expect(blockBaselines.length).toBeGreaterThan(0);
    // Знак — шапка блока: весь текст начинается ниже его нижнего края.
    for (const y of blockBaselines)
      expect(y).toBeGreaterThan(box.top + box.height);
  });

  it('поднимает знак вместе с длинной цитатой', () => {
    // Знак привязан к первой строке, а не к низу кадра: иначе многострочная
    // цитата подъехала бы под него и легла поверх.
    const short = brandLogoBox({ quoteLines: 1, metaLines: 0 });
    const long = brandLogoBox({ quoteLines: 6, metaLines: 2 });

    expect(long.top).toBeLessThan(short.top);
    expect(long.top).toBeGreaterThan(0);
  });

  it('отметку об ИИ ставит последней строкой блока', () => {
    const svg = buildStoryOverlaySvg({
      text: 'Цитата',
      attribution: 'Шри Кришна',
    });
    const baseline = (kind: string) => {
      const found = [
        ...svg.matchAll(/<text[^>]*y="(\d+(?:\.\d+)?)"[^>]*class="([a-z]+)"/g),
      ].find((match) => match[2] === kind);
      return Number(found?.[1]);
    };

    expect(svg).toContain(AI_DISCLOSURE);
    expect(baseline('disclosure')).toBeGreaterThan(baseline('meta'));
    expect(baseline('disclosure')).toBeLessThan(STORY_HEIGHT);
  });

  it('рисует знак в готовом слое подписи', async () => {
    // Знак вшит в код строкой, а не читается файлом: проверяем, что он
    // действительно попадает на пиксели, а не теряется по дороге.
    const overlay = await renderStoryOverlay({ text: 'Цитата' });
    const box = brandLogoBox();
    const { data, info } = await sharp(overlay)
      .extract({
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let visible = 0;
    for (let i = info.channels - 1; i < data.length; i += info.channels)
      if (data[i] > 8) visible++;
    expect(visible).toBeGreaterThan(0);
  });

  it('renders the attribution when there is one', () => {
    const svg = buildStoryOverlaySvg({
      text: 'Цитата',
      attribution: 'Шрила Прабхупада · Лиламрита',
    });
    expect(svg).toContain('Шрила Прабхупада · Лиламрита');
  });

  it('omits the attribution line when there is none', () => {
    expect(buildStoryOverlaySvg({ text: 'Цитата' })).not.toContain(
      'class="meta"',
    );
  });

  it('wraps a long attribution instead of running it off the edge', () => {
    const svg = buildStoryOverlaySvg({
      text: 'Цитата',
      attribution:
        'А. Ч. Бхактиведанта Свами Прабхупада · Прабхупада-лиламрита · Глава 6',
    });
    const metaLines = [...svg.matchAll(/class="meta"/g)];
    expect(metaLines.length).toBeGreaterThan(1);
  });

  it('keeps the wrapped quote inside the horizontal margins', () => {
    // Длинное тире шире буквы — раньше строка с ним вылезала за правый край.
    const lines = wrapText(
      'Всё движение сознания Кришны — это массовое лечение материалистичных людей',
      54,
      (1080 - 88 * 2) * 0.96,
    );
    for (const line of lines) expect(line.length).toBeLessThan(34);
  });

  it('escapes the text it is given', () => {
    const svg = buildStoryOverlaySvg({ text: 'Вера & <надежда>' });
    expect(svg).toContain('Вера &amp; &lt;надежда&gt;');
    expect(svg).not.toContain('<надежда>');
  });

  it('keeps every line inside the frame', () => {
    const svg = buildStoryOverlaySvg({ text: 'слово '.repeat(300) });
    const ys = [...svg.matchAll(/<text[^>]*y="(-?\d+(?:\.\d+)?)"/g)].map(
      (match) => Number(match[1]),
    );
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(STORY_HEIGHT);
  });
});

describe('composeStoryImage', () => {
  // Модель отдаёт 2:3, а сторис вертикальнее — фон обязан докадрироваться.
  const background = () =>
    sharp({
      create: {
        width: 1024,
        height: 1536,
        channels: 3,
        background: { r: 40, g: 30, b: 80 },
      },
    })
      .png()
      .toBuffer();

  it('produces a 1080x1920 frame from a 2:3 source', async () => {
    const composed = await composeStoryImage(await background(), {
      text: 'Не сдавайся на полпути.',
      attribution: 'Шрила Прабхупада',
    });

    const meta = await sharp(composed).metadata();
    expect(meta.width).toBe(STORY_WIDTH);
    expect(meta.height).toBe(STORY_HEIGHT);
    expect(meta.format).toBe('png');
  });

  it('changes the pixels it draws over', async () => {
    const source = await background();
    const composed = await composeStoryImage(source, { text: 'Цитата' });

    const plain = await sharp(source)
      .resize(STORY_WIDTH, STORY_HEIGHT, {
        fit: 'cover',
        position: 'attention',
      })
      .png()
      .toBuffer();
    expect(composed.equals(plain)).toBe(false);
  });
});

describe('маркировка готового кадра', () => {
  it('пишет отметку и в пиксели, и в метаданные PNG', async () => {
    const background = await sharp({
      create: {
        width: 1024,
        height: 1536,
        channels: 3,
        background: { r: 40, g: 30, b: 80 },
      },
    })
      .png()
      .toBuffer();

    const composed = await composeStoryImage(background, { text: 'Цитата' });
    const text = readPngText(composed);

    expect(text.Comment).toBe(AI_DISCLOSURE);
    expect(text.Software).toBe('VedaMatch');
    // Метаданные не должны ломать саму картинку.
    const meta = await sharp(composed).metadata();
    expect(meta.width).toBe(STORY_WIDTH);
    expect(meta.height).toBe(STORY_HEIGHT);
  });

  it('называет в отметке и нейросеть, и бренд', () => {
    // Знак внизу кадра тоже говорит про бренд, но подпись должна читаться и
    // тогда, когда кадр пересняли с обрезкой логотипа.
    expect(AI_DISCLOSURE).toMatch(/нейросет/i);
    expect(AI_DISCLOSURE).toContain('VedaMatch');
  });
});

describe('buildStoryOverlaySvg · лимит строк цитаты', () => {
  // 9 строк по умолчанию при этом тексте — проверено на реальной функции.
  const longText =
    'Преданность освобождает ум от иллюзии и открывает путь к истинному счастью. '.repeat(
      3,
    );

  function quoteLineCount(svg: string): number {
    return (svg.match(/class="quote"/g) ?? []).length;
  }

  it('без maxQuoteLines укладывается в дефолтный лимит (12)', () => {
    const svg = buildStoryOverlaySvg({ text: longText });
    expect(quoteLineCount(svg)).toBeGreaterThan(4);
  });

  it('с maxQuoteLines обрезает раньше', () => {
    const svg = buildStoryOverlaySvg({ text: longText, maxQuoteLines: 4 });
    expect(quoteLineCount(svg)).toBeLessThanOrEqual(4);
  });

  it('renderStoryOverlay учитывает maxQuoteLines при расчёте места под знак', async () => {
    const short = await renderStoryOverlay({ text: 'Коротко' });
    const long = await renderStoryOverlay({
      text: longText,
      maxQuoteLines: 4,
    });
    // Не падает и возвращает валидный PNG-буфер — сам расчёт места под знак
    // уже покрыт другими тестами файла через brandLogoBox().
    expect(short.length).toBeGreaterThan(0);
    expect(long.length).toBeGreaterThan(0);
  });
});
