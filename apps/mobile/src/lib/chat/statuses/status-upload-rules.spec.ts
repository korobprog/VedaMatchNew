import {
  canPublishStatus,
  formatStatusDuration,
  normalizePickedStatusMedia,
  statusFormText,
  statusMediaDenial,
  statusMediaKindFor,
  statusTextDenial,
  type StatusMedia,
} from './status-upload-rules';

const media = (over: Partial<StatusMedia> = {}): StatusMedia => ({
  uri: 'file:///a.jpg',
  name: 'a.jpg',
  type: 'image/jpeg',
  kind: 'photo',
  sizeBytes: 1000,
  durationSec: null,
  width: null,
  height: null,
  ...over,
});

describe('statusMediaKindFor (VED-129)', () => {
  it('фото и видео из списков сервера, остальное — нет', () => {
    expect(statusMediaKindFor('image/png')).toBe('photo');
    expect(statusMediaKindFor('video/mp4')).toBe('video');
    expect(statusMediaKindFor('image/gif')).toBeNull();
    expect(statusMediaKindFor('video/quicktime')).toBeNull();
  });
});

describe('normalizePickedStatusMedia', () => {
  it('ролик из галереи: MIME как есть, миллисекунды — в секунды', () => {
    const result = normalizePickedStatusMedia(
      { uri: 'file:///v.mp4', type: 'video', mimeType: 'video/mp4', fileSize: 5, duration: 23_400, width: 720, height: 1280 },
      1,
    );
    expect(result).toMatchObject({ type: 'video/mp4', kind: 'video', durationSec: 23.4, sizeBytes: 5, name: 'video-1.mp4' });
  });

  it('без MIME — по расширению', () => {
    expect(normalizePickedStatusMedia({ uri: 'file:///p.JPG?x=1' }, 1)).toMatchObject({
      type: 'image/jpeg',
      kind: 'photo',
      name: 'photo-1.jpeg',
    });
  });

  it('незнакомый ролик остаётся роликом — и получает отказ по типу', () => {
    const result = normalizePickedStatusMedia({ uri: 'file:///v.3gp', type: 'video', mimeType: 'video/3gpp' });
    expect(result.kind).toBe('video');
    expect(statusMediaDenial(result)).toMatch(/MP4, WebM/);
  });

  it('нулевые размеры пикера — «неизвестно», а не ноль', () => {
    expect(normalizePickedStatusMedia({ uri: 'file:///a.png', width: 0, height: 0, duration: 0 })).toMatchObject({
      width: null,
      height: null,
      durationSec: null,
    });
  });
});

describe('statusMediaDenial', () => {
  it('пределы размера — как у сервера', () => {
    expect(statusMediaDenial(media({ sizeBytes: 10 * 1024 * 1024 }))).toBeNull();
    expect(statusMediaDenial(media({ sizeBytes: 10 * 1024 * 1024 + 1 }))).toBe('Фото больше 10 МБ');
    expect(statusMediaDenial(media({ type: 'video/mp4', sizeBytes: 51 * 1024 * 1024 }))).toBe('Видео больше 50 МБ');
  });

  it('ролик длиннее минуты не принимается, неизвестная длительность — решает сервер', () => {
    expect(statusMediaDenial(media({ type: 'video/mp4', durationSec: 61 }))).toBe('Видео длиннее 60 секунд');
    expect(statusMediaDenial(media({ type: 'video/mp4', durationSec: 60.3 }))).toBeNull();
    expect(statusMediaDenial(media({ type: 'video/mp4', durationSec: null }))).toBeNull();
  });
});

describe('текст и кнопка «Опубликовать»', () => {
  it('пустой без файла — нельзя, с файлом — можно', () => {
    expect(statusTextDenial('   ', false)).toMatch(/Напишите текст/);
    expect(statusTextDenial('', true)).toBeNull();
  });

  it('длиннее 700 знаков — нельзя', () => {
    expect(statusTextDenial('а'.repeat(701), false)).toMatch(/700/);
    expect(statusTextDenial('а'.repeat(700), false)).toBeNull();
  });

  it('кнопка гаснет на время отправки и при негодном файле', () => {
    expect(canPublishStatus({ text: 'Харе Кришна', media: null, pending: false })).toBe(true);
    expect(canPublishStatus({ text: 'Харе Кришна', media: null, pending: true })).toBe(false);
    expect(canPublishStatus({ text: '', media: media({ type: 'image/gif' }), pending: false })).toBe(false);
    expect(canPublishStatus({ text: '', media: media(), pending: false })).toBe(true);
  });

  it('текст в форму — обрезанный, пустой не уходит', () => {
    expect(statusFormText('  привет ')).toBe('привет');
    expect(statusFormText('   ')).toBeNull();
  });
});

describe('formatStatusDuration', () => {
  it('минуты и секунды', () => {
    expect(formatStatusDuration(23.4)).toBe('0:23');
    expect(formatStatusDuration(60)).toBe('1:00');
    expect(formatStatusDuration(null)).toBe('');
  });
});
