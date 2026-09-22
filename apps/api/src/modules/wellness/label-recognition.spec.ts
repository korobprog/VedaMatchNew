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

  it('задание требует не терять предупреждение о следах', () => {
    // Без этой строки модель считает «может содержать следы рыбы» отдельным
    // предложением и выбрасывает — проверено на живых моделях.
    const text = JSON.stringify(body.messages[0].content[0]);
    expect(text).toContain('следы');
  });
});

describe('parseLabelResponse', () => {
  const reply = (content: unknown) => ({ choices: [{ message: { content } }] });

  it('отдаёт и ответ целиком, и состав без заголовка', () => {
    // `raw` нужен серверу, чтобы отличить снимок состава от бока пачки
    // (`composition-word.ts`); в базу и в вердикт идёт `ingredientsRaw`.
    expect(parseLabelResponse(reply('Состав: сахар, соль'))).toEqual({
      raw: 'Состав: сахар, соль',
      ingredientsRaw: 'сахар, соль',
    });
  });

  it('снимает кавычки вокруг ответа', () => {
    expect(parseLabelResponse(reply('«сахар, соль»')).ingredientsRaw).toBe(
      'сахар, соль',
    );
  });

  it('ответ без заголовка не теряется: решение об отказе принимает не разбор', () => {
    expect(parseLabelResponse(reply('сахар, соль'))).toEqual({
      raw: 'сахар, соль',
      ingredientsRaw: 'сахар, соль',
    });
  });

  it('пустой ответ остаётся пустым, а не превращается в выдумку', () => {
    const empty = { raw: '', ingredientsRaw: '' };
    expect(parseLabelResponse(reply(''))).toEqual(empty);
    expect(parseLabelResponse({ choices: [] })).toEqual(empty);
    expect(parseLabelResponse(null)).toEqual(empty);
    expect(parseLabelResponse(reply(42))).toEqual(empty);
  });
});

describe('задание модели', () => {
  it('просит начать ответ словом-заголовком: по нему проверяется снимок', () => {
    const text = JSON.stringify(
      buildLabelRequest('m', pixel).messages[0].content[0],
    );
    expect(text).toContain('словом-заголовком');
    // Про последствия модели не говорим — иначе она допишет слово от себя.
    expect(text).not.toContain('отклон');
    expect(text).not.toContain('не примем');
  });
});
