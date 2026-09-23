import { ApiError } from '@/lib/api/client';
import { blogCodeMessage, describeBlogError, describeFailedPhotos, isBlogPostGone } from './blog-error';

const fallback = 'Не удалось загрузить ленту.';

describe('describeBlogError', () => {
  it('код сервиса — словами, а не «daily_limit_reached»', () => {
    expect(describeBlogError(new ApiError(400, 'daily_limit_reached', null), fallback)).toBe(
      'На сегодня постов достаточно — продолжите завтра.',
    );
    expect(describeBlogError(new ApiError(400, 'image_upload_unavailable', null), fallback)).toBe(
      'Загрузка фотографий сейчас недоступна.',
    );
  });

  it('незнакомый код — общий текст действия, код на экран не попадает', () => {
    expect(describeBlogError(new ApiError(400, 'something_new', null), fallback)).toBe(fallback);
  });

  it('сеть, сессия, перегрузка и сервер — каждое своими словами', () => {
    expect(describeBlogError(new ApiError(0, 'Нет связи с сервером. Проверьте интернет и повторите.', null), fallback)).toBe(
      'Нет связи с сервером. Проверьте интернет и повторите.',
    );
    expect(describeBlogError(new ApiError(401, 'Unauthorized', null), fallback)).toBe('Сессия закончилась. Войдите снова.');
    expect(describeBlogError(new ApiError(413, 'Payload Too Large', null), fallback)).toBe(
      'Фотографии слишком большие — каждая до 10 МБ.',
    );
    expect(describeBlogError(new ApiError(429, 'ThrottlerException', null), fallback)).toBe(
      'Слишком часто. Подождите немного и повторите.',
    );
    expect(describeBlogError(new ApiError(502, 'Bad Gateway', null), fallback)).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
  });

  it('обрыв сети без ответа — «нет соединения», а не java.net.UnknownHostException', () => {
    expect(describeBlogError(new TypeError('java.net.UnknownHostException: api.vedamatch.ru'), fallback)).toBe(
      'Нет соединения с сервером.',
    );
  });
});

describe('isBlogPostGone', () => {
  it('404 — пост удалён, остальное — нет', () => {
    expect(isBlogPostGone(new ApiError(404, 'post_not_found', null))).toBe(true);
    expect(isBlogPostGone(new ApiError(500, 'x', null))).toBe(false);
    expect(isBlogPostGone(new Error('x'))).toBe(false);
  });
});

describe('describeFailedPhotos', () => {
  it('все доехали — молчим', () => {
    expect(describeFailedPhotos([])).toBeNull();
  });

  it('часть не доехала — сказано, сколько и почему, одинаковые причины не повторяются', () => {
    expect(
      describeFailedPhotos([
        { name: 'photo-1.jpg', reason: 'processing_failed' },
        { name: 'photo-2.jpg', reason: 'processing_failed' },
      ]),
    ).toBe('Пост опубликован, но 2 фотографии не загрузились: Не удалось обработать фотографию.');
  });

  it('незнакомая причина — общими словами', () => {
    expect(describeFailedPhotos([{ name: 'a.jpg', reason: 'weird' }])).toBe(
      'Пост опубликован, но 1 фотография не загрузилась: Не удалось загрузить.',
    );
  });

  it('словарь знает все коды, которые отдаёт сервис', () => {
    for (const code of [
      'post_empty',
      'title_too_long',
      'text_too_long',
      'too_many_images',
      'daily_limit_reached',
      'image_upload_unavailable',
      'unsupported_type',
      'file_too_large',
      'processing_failed',
      'post_not_found',
      'author_not_found',
      'not_your_post',
    ]) {
      expect(blogCodeMessage(code)).not.toBeNull();
    }
  });
});
