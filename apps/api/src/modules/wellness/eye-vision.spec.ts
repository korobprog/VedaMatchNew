import {
  EYE_IMAGE_MAX_BYTES,
  EYE_SPEECH_MAX_CHARS,
  EyeInputError,
  buildEyeRequest,
  cleanSpeech,
  parseEyeFrame,
  parseEyeMode,
  parseEyeResponse,
  parsePrevious,
} from './eye-vision';

const FRAME = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function reply(content: unknown) {
  return { choices: [{ message: { content } }] };
}

describe('parseEyeMode', () => {
  it('принимает три режима', () => {
    expect(parseEyeMode('transport')).toBe('transport');
    expect(parseEyeMode('shop')).toBe('shop');
    expect(parseEyeMode('scene')).toBe('scene');
  });

  it('остальное — ошибка ввода, а не молчаливое умолчание', () => {
    expect(() => parseEyeMode('bus')).toThrow(EyeInputError);
    expect(() => parseEyeMode(undefined)).toThrow(EyeInputError);
  });
});

describe('parseEyeFrame', () => {
  it('пропускает JPEG data-URL', () => {
    expect(parseEyeFrame(FRAME)).toBe(FRAME);
  });

  it('отказывает не-картинке и чужому формату', () => {
    expect(() => parseEyeFrame('https://example.com/a.jpg')).toThrow(
      EyeInputError,
    );
    expect(() => parseEyeFrame('data:image/gif;base64,R0lGOD==')).toThrow(
      'Поддерживаются JPEG, PNG и WebP',
    );
    expect(() => parseEyeFrame('data:image/jpeg;base64,не base64')).toThrow(
      EyeInputError,
    );
  });

  it('режет кадр больше предела', () => {
    const payload = 'A'.repeat(Math.ceil(((EYE_IMAGE_MAX_BYTES + 3) * 4) / 3));
    expect(() => parseEyeFrame(`data:image/jpeg;base64,${payload}`)).toThrow(
      'Кадр слишком большой',
    );
  });
});

describe('parsePrevious', () => {
  it('склеивает пробелы и срезает пустое', () => {
    expect(parsePrevious('  Автобус\n 47 ')).toBe('Автобус 47');
    expect(parsePrevious('   ')).toBeNull();
    expect(parsePrevious(47)).toBeNull();
  });

  it('не пускает в промпт простыню', () => {
    expect(parsePrevious('а'.repeat(1000))?.length).toBe(EYE_SPEECH_MAX_CHARS);
  });
});

function taskText(body: ReturnType<typeof buildEyeRequest>): string {
  const user = body.messages[1];
  return user.role === 'user' && user.content[0].type === 'text'
    ? user.content[0].text
    : '';
}

describe('buildEyeRequest', () => {
  it('тело chat/completions: системная роль, задание и кадр', () => {
    const body = buildEyeRequest('gemini-3.6-flash', 'transport', FRAME, null);
    expect(body.model).toBe('gemini-3.6-flash');
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBeLessThanOrEqual(150);
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    const user = body.messages[1];
    if (user.role !== 'user')
      throw new Error('ожидалось сообщение пользователя');
    expect(user.content[0]).toMatchObject({ type: 'text' });
    expect(user.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: FRAME, detail: 'high' },
    });
  });

  it('к человеку — на «вы»', () => {
    const system = buildEyeRequest('m', 'scene', FRAME, null).messages[0];
    expect(system.role === 'system' ? system.content : '').toContain('на «вы»');
  });

  it('у каждого режима своё задание', () => {
    expect(taskText(buildEyeRequest('m', 'transport', FRAME, null))).toMatch(
      /номер маршрута/,
    );
    expect(taskText(buildEyeRequest('m', 'shop', FRAME, null))).toMatch(
      /ценник/,
    );
    expect(taskText(buildEyeRequest('m', 'scene', FRAME, null))).toMatch(
      /ступеньки/,
    );
  });

  it('обзору сцены мелочи не нужны — детализация низкая', () => {
    const user = buildEyeRequest('m', 'scene', FRAME, null).messages[1];
    if (user.role !== 'user' || user.content[1].type !== 'image_url') {
      throw new Error('ожидался кадр');
    }
    expect(user.content[1].image_url.detail).toBe('low');
  });

  it('прошлая фраза уходит в задание, чтобы модель не пересказывала её иначе', () => {
    expect(
      taskText(buildEyeRequest('m', 'transport', FRAME, 'Автобус 47')),
    ).toContain('«Автобус 47»');
    expect(
      taskText(buildEyeRequest('m', 'transport', FRAME, null)),
    ).not.toContain('Перед этим');
  });
});

describe('parseEyeResponse', () => {
  it('фраза как есть', () => {
    expect(parseEyeResponse(reply('Автобус 47, до вокзала.'))).toEqual({
      speech: 'Автобус 47, до вокзала.',
      nothing: false,
    });
  });

  it('«НЕТ» в любом регистре и с точкой — молчание', () => {
    for (const word of ['НЕТ', 'нет.', ' Нет! ', '«НЕТ»']) {
      expect(parseEyeResponse(reply(word))).toEqual({
        speech: '',
        nothing: true,
      });
    }
  });

  it('«Нет, это грузовик» — это уже фраза, а не признак', () => {
    expect(parseEyeResponse(reply('Нет, это грузовик.')).nothing).toBe(false);
  });

  it('пустой и сломанный ответ — молчание, а не исключение', () => {
    expect(parseEyeResponse(reply(''))).toEqual({ speech: '', nothing: true });
    expect(parseEyeResponse(reply(null)).nothing).toBe(true);
    expect(parseEyeResponse({}).nothing).toBe(true);
    expect(parseEyeResponse(null).nothing).toBe(true);
  });
});

describe('cleanSpeech', () => {
  it('срезает разметку, которую синтезатор прочёл бы вслух', () => {
    expect(cleanSpeech('**Молоко** «Простоквашино»\n- 2,5%\n- 89 ₽')).toBe(
      'Молоко «Простоквашино» 2,5% 89 ₽',
    );
  });

  it('длинный ответ обрезается по концу предложения', () => {
    const long = `Автобус 47, до вокзала. ${'Очень длинное описание сцены. '.repeat(20)}`;
    const out = cleanSpeech(long);
    expect(out.length).toBeLessThanOrEqual(EYE_SPEECH_MAX_CHARS);
    expect(out.endsWith('.')).toBe(true);
    expect(out.startsWith('Автобус 47')).toBe(true);
  });

  it('без точек — по слову и с многоточием', () => {
    const out = cleanSpeech('слово '.repeat(100));
    expect(out.length).toBeLessThanOrEqual(EYE_SPEECH_MAX_CHARS);
    expect(out.endsWith('слово…')).toBe(true);
  });
});
