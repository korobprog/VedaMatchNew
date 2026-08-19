import { buildPromptDraftRequest, cleanDraftedPrompt } from './prompt-drafts';

const base = {
  meaning: 'ценность действия определяется его целью',
  attribution: 'Шри Кришна · Бхагавад-гита · 3.9',
  context: 'Кришна наставляет Арджуну перед битвой',
};

describe('buildPromptDraftRequest: картинка', () => {
  const request = buildPromptDraftRequest('image', base);

  it('требует сцену, свет и композицию', () => {
    expect(request).toContain('the scene');
    expect(request).toContain('light');
    expect(request).toContain('composition');
  });

  it('запрещает буквализацию образа', () => {
    // Ровно на этом «отдавая плоды Мне» из Гиты обернулось детьми с яблоками.
    expect(request).toContain('Read figurative wording as metaphor');
  });

  it('запрещает буквы в кадре — подпись накладываем сами', () => {
    expect(request).toContain('No text, letters or captions');
  });

  it('передаёт источник и проверенный контекст', () => {
    expect(request).toContain('Шри Кришна');
    expect(request).toContain('Кришна наставляет Арджуну');
  });
});

describe('buildPromptDraftRequest: движение', () => {
  const request = buildPromptDraftRequest('video', base);

  it('просит описывать движение, а не сцену', () => {
    // Видеомодель уже получила кадр: описывать ей сцену бессмысленно, и
    // раньше именно из-за этого в неё уходил промпт картинки.
    expect(request).toContain('describes MOTION only');
    expect(request).toContain('Do not describe the scene itself');
  });

  it('требует сдержанности и запрещает превращения', () => {
    expect(request).toContain('almost still');
    expect(request).toContain('may transform into something else');
  });

  it('короче, чем задание для картинки', () => {
    const image = buildPromptDraftRequest('image', base);
    expect(request.length).toBeLessThan(image.length);
  });
});

describe('оба задания', () => {
  it('запрещают называть существующие произведения', () => {
    // На упоминании фильма ElevenLabs отбил промпт модерацией.
    for (const kind of ['image', 'video'] as const) {
      expect(buildPromptDraftRequest(kind, base)).toContain(
        'Never name a real film',
      );
    }
  });

  it('принимают пожелание редактора, но не требуют его', () => {
    const withWish = buildPromptDraftRequest('image', {
      ...base,
      mood: 'больше тишины',
    });
    expect(withWish).toContain('больше тишины');
    expect(buildPromptDraftRequest('image', base)).not.toContain(
      "Editor's wish",
    );
  });
});

describe('cleanDraftedPrompt', () => {
  it('срезает вступление и кавычки', () => {
    expect(cleanDraftedPrompt('Here is the prompt: "a quiet dawn"')).toBe(
      'a quiet dawn',
    );
  });

  it('обычный ответ не портит', () => {
    const plain = 'Gentle wind in the leaves, camera almost still.';
    expect(cleanDraftedPrompt(plain)).toBe(plain);
  });
});
