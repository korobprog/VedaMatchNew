import sharp from 'sharp';
import { isPng, readPngText, withPngText } from './png-metadata';

const png = () =>
  sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();

describe('withPngText', () => {
  it('кладёт русский текст без потерь', async () => {
    // tEXt хранит только Latin-1 и превратил бы кириллицу в мусор — потому и
    // взят iTXt с UTF-8.
    const text = 'Создано нейросетью в VedaMatch';
    const marked = withPngText(await png(), [{ keyword: 'Comment', text }]);

    expect(readPngText(marked).Comment).toBe(text);
  });

  it('пишет несколько записей разом', async () => {
    const marked = withPngText(await png(), [
      { keyword: 'Comment', text: 'Создано нейросетью' },
      { keyword: 'Software', text: 'VedaMatch' },
    ]);
    const read = readPngText(marked);

    expect(read.Comment).toBe('Создано нейросетью');
    expect(read.Software).toBe('VedaMatch');
  });

  it('оставляет картинку читаемой', async () => {
    // Чанк вставляется в середину файла: ошибка в длине или контрольной сумме
    // сделала бы PNG битым, а на глаз этого не увидеть.
    const marked = withPngText(await png(), [
      { keyword: 'Comment', text: 'Создано нейросетью в VedaMatch' },
    ]);
    const meta = await sharp(marked).metadata();

    expect(meta.width).toBe(8);
    expect(meta.height).toBe(8);
    expect(meta.format).toBe('png');
  });

  it('вставляет запись до данных изображения', async () => {
    // После IDAT часть просмотрщиков текстовые чанки уже не показывает.
    const marked = withPngText(await png(), [
      { keyword: 'Comment', text: 'метка' },
    ]);

    expect(marked.indexOf(Buffer.from('iTXt'))).toBeLessThan(
      marked.indexOf(Buffer.from('IDAT')),
    );
  });

  it('пустой список возвращает файл нетронутым', async () => {
    const source = await png();
    expect(withPngText(source, []).equals(source)).toBe(true);
  });

  it('отказывается работать с не-PNG', () => {
    expect(isPng(Buffer.from('это не картинка'))).toBe(false);
    expect(() => withPngText(Buffer.from('это не картинка'), [])).toThrow();
  });
});
