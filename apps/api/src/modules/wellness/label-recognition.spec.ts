import {
  buildLabelRequest,
  LabelImageError,
  parseImageDataUrl,
  parseLabelResponse,
} from './label-recognition';

const pixel = 'data:image/jpeg;base64,' + 'A'.repeat(120);

describe('parseImageDataUrl', () => {
  it('принимает снимок допустимого типа', () => {
    expect(parseImageDataUrl(pixel)).toBe(pixel);
  });

  it('отвергает не-картинку и чужой тип', () => {
    expect(() => parseImageDataUrl('привет')).toThrow(LabelImageError);
    expect(() => parseImageDataUrl('data:application/pdf;base64,QUJD')).toThrow(
      LabelImageError,
    );
  });

  it('отвергает снимок сверх предела', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024);
    expect(() => parseImageDataUrl(huge)).toThrow(LabelImageError);
  });
});

describe('buildLabelRequest', () => {
  const body = buildLabelRequest('gpt-5.4-mini', pixel);

  it('кладёт картинку и задание в одно сообщение', () => {
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content.map((part) => part.type)).toEqual([
      'text',
      'image_url',
    ]);
  });

  it('просит не выдумывать: температура ноль', () => {
    expect(body.temperature).toBe(0);
  });

  it('передаёт снимок как есть', () => {
    const image = body.messages[0].content[1];
    expect(image).toMatchObject({ image_url: { url: pixel } });
  });

  it('задание требует вернуть состав без перевода', () => {
    const text = body.messages[0].content[0];
    expect(JSON.stringify(text)).toContain('Состав');
  });
});

describe('parseLabelResponse', () => {
  const reply = (content: unknown) => ({ choices: [{ message: { content } }] });

  it('снимает служебное «Состав:» — его добавит наш разбор', () => {
    expect(parseLabelResponse(reply('Состав: сахар, соль'))).toBe(
      'сахар, соль',
    );
  });

  it('снимает кавычки вокруг ответа', () => {
    expect(parseLabelResponse(reply('«сахар, соль»'))).toBe('сахар, соль');
  });

  it('пустой ответ остаётся пустым, а не превращается в выдумку', () => {
    expect(parseLabelResponse(reply(''))).toBe('');
    expect(parseLabelResponse({ choices: [] })).toBe('');
    expect(parseLabelResponse(null)).toBe('');
    expect(parseLabelResponse(reply(42))).toBe('');
  });
});
