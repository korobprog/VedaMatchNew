import {
  buildMusicPromptRequest,
  cleanMusicPrompt,
  DEFAULT_MUSIC_BRIEF,
} from './music-prompt';
import { buildMusicRequest } from './motivation-music.service';

describe('buildMusicPromptRequest', () => {
  const base = { meaning: 'ценность бескорыстного действия' };

  it('требует инструментовку, регистр и запреты, а не настроение', () => {
    // Модель музыки слушается конкретики: на «медитативно и спокойно» она
    // выдаёт приятный фон, а нужен вес.
    const request = buildMusicPromptRequest(base);
    expect(request).toContain('instrumentation');
    expect(request).toContain('register and tempo');
    expect(request).toContain('explicit negatives');
  });

  it('запрещает называть существующие произведения', () => {
    // ElevenLabs отбивает промпт модерацией, если в нём назван фильм.
    expect(buildMusicPromptRequest(base)).toContain('Never name a real film');
  });

  it('передаёт смысл цитаты и пожелание редактора', () => {
    const request = buildMusicPromptRequest({
      ...base,
      attribution: 'Шри Кришна',
      mood: 'раковина и приближение',
    });
    expect(request).toContain('ценность бескорыстного действия');
    expect(request).toContain('Шри Кришна');
    expect(request).toContain('раковина и приближение');
  });
});

describe('cleanMusicPrompt', () => {
  it('срезает вступление модели', () => {
    // «Here is your prompt:» ушло бы в музыкальный промпт как есть.
    expect(cleanMusicPrompt("Here's your prompt: low cello drone")).toBe(
      'low cello drone',
    );
    expect(cleanMusicPrompt('Prompt: low cello drone')).toBe('low cello drone');
  });

  it('снимает кавычки и лишние переносы', () => {
    expect(cleanMusicPrompt('"low cello\n\ndrone"')).toBe('low cello drone');
  });

  it('обычный ответ не портит', () => {
    const plain = 'Low cello and tanpura, 48 bpm, no vocals.';
    expect(cleanMusicPrompt(plain)).toBe(plain);
  });
});

describe('buildMusicRequest', () => {
  const base = { prompt: 'low cello drone', seconds: 20 };

  it('ElevenLabs получает длину в миллисекундах и флаг инструментала', () => {
    const request = buildMusicRequest({
      ...base,
      model: 'fal-ai/elevenlabs/music',
    });
    expect(request.music_length_ms).toBe(20_000);
    expect(request.force_instrumental).toBe(true);
    expect(request.duration).toBeUndefined();
  });

  it('Lyria длину не принимает вовсе', () => {
    const request = buildMusicRequest({ ...base, model: 'fal-ai/lyria2' });
    expect(request.duration).toBeUndefined();
    expect(request.music_length_ms).toBeUndefined();
  });

  it('остальные считают в секундах', () => {
    const request = buildMusicRequest({ ...base, model: 'fal-ai/ace-step' });
    expect(request.duration).toBe(20);
  });
});

describe('замысел по умолчанию', () => {
  it('без описания задание всё равно осмысленно', () => {
    // Кнопка «Сочинить промпт» должна давать результат сразу: неактивная
    // кнопка без объяснения читается как поломка.
    const request = buildMusicPromptRequest({ meaning: DEFAULT_MUSIC_BRIEF });
    expect(request).toContain('instrumental bed');
    expect(request).toContain('Strictly instrumental');
  });
});
