import {
  cameraAccess,
  cameraAction,
  describeCameraAccess,
  type CameraAccess,
} from './camera-access';

describe('cameraAccess', () => {
  it('ответа ещё нет — спрашиваем, а не отказываем', () => {
    expect(cameraAccess(null)).toBe('ask');
    expect(cameraAccess(undefined)).toBe('ask');
  });

  it('разрешено', () => {
    expect(cameraAccess({ granted: true, canAskAgain: false })).toBe('granted');
    expect(cameraAccess({ granted: true, canAskAgain: true })).toBe('granted');
  });

  it('отказ, но спросить ещё можно — обычное объяснение', () => {
    expect(cameraAccess({ granted: false, canAskAgain: true })).toBe('ask');
  });

  it('отказ насовсем — отдельное состояние, иначе кнопка ничего не делает', () => {
    expect(cameraAccess({ granted: false, canAskAgain: false })).toBe('blocked');
  });
});

describe('cameraAction', () => {
  it.each([
    ['ask', 'request'],
    ['blocked', 'settings'],
    ['granted', 'none'],
  ] as [CameraAccess, string][])('%s ведёт в %s', (access, action) => {
    expect(cameraAction(access)).toBe(action);
  });
});

describe('describeCameraAccess', () => {
  it('разрешено — объяснять нечего', () => {
    expect(describeCameraAccess('granted')).toBeNull();
  });

  it.each(['ask', 'blocked'] as CameraAccess[])(
    '«%s» объясняет, зачем камера, и оставляет запасной путь',
    (access) => {
      const copy = describeCameraAccess(access);
      expect(copy).not.toBeNull();
      expect(copy?.title.length).toBeGreaterThan(0);
      expect(copy?.body.length).toBeGreaterThan(20);
      // Отказ не тупик: ручной ввод назван в обоих состояниях.
      expect(copy?.fallback.toLowerCase()).toContain('вручную');
      expect(copy?.action).toBeTruthy();
    },
  );

  it('объяснение говорит, что снимок никуда не уходит', () => {
    // Обещание, на котором держится согласие: наружу уходит код, не картинка.
    expect(describeCameraAccess('ask')?.body).toContain('снимок никуда не отправляется');
  });

  it('у окончательного отказа сказано, что система больше не спросит', () => {
    expect(describeCameraAccess('blocked')?.body).toContain('настройках');
  });

  it('тексты двух состояний не совпадают', () => {
    expect(describeCameraAccess('ask')?.title).not.toBe(
      describeCameraAccess('blocked')?.title,
    );
  });
});
