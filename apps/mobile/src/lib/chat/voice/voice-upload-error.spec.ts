import { describeVoiceUploadError } from './voice-upload-error';

describe('describeVoiceUploadError', () => {
  it('всегда одна и та же русская фраза, без параметров', () => {
    expect(describeVoiceUploadError()).toBe('Не удалось отправить голосовое');
  });

  it('в тексте нет латиницы — причина не могла просочиться из английской ошибки fetch', () => {
    expect(describeVoiceUploadError()).not.toMatch(/[a-zA-Z]/);
  });
});
