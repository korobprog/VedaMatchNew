import { describeMediaError, isPermissionDeniedMessage } from './call-media-error';

describe('describeMediaError', () => {
  it('NotAllowedError на Android — отправляет в настройки телефона', () => {
    const error = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    expect(describeMediaError(error, 'android')).toBe(
      'Нет доступа к микрофону или камере — разрешите его в настройках телефона',
    );
  });

  it('NotAllowedError на вебе — отправляет в браузер, не в настройки телефона', () => {
    const error = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const message = describeMediaError(error, 'web');
    expect(message).toBe('Нет доступа к микрофону или камере — разрешите его в браузере и обновите страницу');
    expect(message).not.toContain('настройках телефона');
  });

  it('SecurityError — тот же текст, что и NotAllowedError, по платформе', () => {
    const error = Object.assign(new Error('blocked'), { name: 'SecurityError' });
    expect(describeMediaError(error, 'web')).toContain('в браузере');
    expect(describeMediaError(error, 'android')).toContain('в настройках телефона');
  });

  it('NotFoundError — устройство не найдено, платформа не важна', () => {
    const error = Object.assign(new Error('no device'), { name: 'NotFoundError' });
    expect(describeMediaError(error, 'web')).toBe('Микрофон или камера не найдены');
    expect(describeMediaError(error, 'android')).toBe('Микрофон или камера не найдены');
  });

  it('NotReadableError — устройство занято другим приложением', () => {
    const error = Object.assign(new Error('busy'), { name: 'NotReadableError' });
    expect(describeMediaError(error, 'web')).toBe('Микрофон или камера заняты другим приложением');
  });

  it('обычная ошибка с сообщением — сообщение как есть', () => {
    expect(describeMediaError(new Error('сеть недоступна'), 'web')).toBe('сеть недоступна');
  });

  it('совсем незнакомое значение — общий текст', () => {
    expect(describeMediaError('строка вместо ошибки', 'web')).toBe('Не удалось начать звонок');
    expect(describeMediaError(null, 'android')).toBe('Не удалось начать звонок');
  });
});

describe('isPermissionDeniedMessage', () => {
  it('распознаёт обе формулировки — и Android, и веб', () => {
    expect(isPermissionDeniedMessage(describeMediaError({ name: 'NotAllowedError' }, 'android'))).toBe(true);
    expect(isPermissionDeniedMessage(describeMediaError({ name: 'NotAllowedError' }, 'web'))).toBe(true);
  });

  it('не путает с другими причинами конца звонка', () => {
    expect(isPermissionDeniedMessage('Микрофон или камера не найдены')).toBe(false);
    expect(isPermissionDeniedMessage('Устройство сейчас занято другим звонком')).toBe(false);
  });

  it('пусто/не строка — не отказ в разрешении', () => {
    expect(isPermissionDeniedMessage(null)).toBe(false);
    expect(isPermissionDeniedMessage(undefined)).toBe(false);
    expect(isPermissionDeniedMessage('')).toBe(false);
  });
});
