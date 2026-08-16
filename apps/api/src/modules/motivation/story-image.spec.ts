import sharp from 'sharp';
import {
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
    expect(escapeXml('«Вера» & <любовь>')).toBe(
      '«Вера» &amp; &lt;любовь&gt;',
    );
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

describe('buildStoryOverlaySvg', () => {
  it('covers the full story frame', () => {
    const svg = buildStoryOverlaySvg({ text: 'Цитата' });
    expect(svg).toContain(`width="${STORY_WIDTH}"`);
    expect(svg).toContain(`height="${STORY_HEIGHT}"`);
  });

  it('signs the card with the brand', () => {
    expect(buildStoryOverlaySvg({ text: 'Цитата' })).toContain('VedaMatch');
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
      .resize(STORY_WIDTH, STORY_HEIGHT, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();
    expect(composed.equals(plain)).toBe(false);
  });
});
