import {
  labelCameraOn,
  scannerCameraOn,
  showFrozenShot,
  type LabelStage,
} from './camera-power';

describe('scannerCameraOn', () => {
  const on = { focused: true, appActive: true, lookup: 'idle' as const };

  it('включена, когда экран на виду и код ещё не прочитан', () => {
    expect(scannerCameraOn(on)).toBe(true);
  });

  it('гаснет сразу после чтения кода, не дожидаясь перехода', () => {
    expect(scannerCameraOn({ ...on, lookup: 'pending' })).toBe(false);
    expect(scannerCameraOn({ ...on, lookup: 'done' })).toBe(false);
  });

  it('гаснет при уходе с экрана', () => {
    expect(scannerCameraOn({ ...on, focused: false })).toBe(false);
  });

  it('гаснет при сворачивании приложения и на звонке', () => {
    expect(scannerCameraOn({ ...on, appActive: false })).toBe(false);
  });

  it('возврат на экран включает её снова', () => {
    expect(scannerCameraOn({ focused: true, appActive: true, lookup: 'idle' })).toBe(
      true,
    );
  });
});

describe('labelCameraOn', () => {
  const on = { focused: true, appActive: true, stage: 'aim' as LabelStage };

  it('включена, пока человек целится', () => {
    expect(labelCameraOn(on)).toBe(true);
  });

  it('гаснет, как только снимок ушёл в разбор', () => {
    expect(labelCameraOn({ ...on, stage: 'reading' })).toBe(false);
  });

  it('не горит на экране ответа', () => {
    expect(labelCameraOn({ ...on, stage: 'answer' })).toBe(false);
  });

  it('«переснять» возвращает стадию прицеливания и камеру', () => {
    const after: LabelStage = 'answer';
    expect(labelCameraOn({ ...on, stage: after })).toBe(false);
    expect(labelCameraOn({ ...on, stage: 'aim' })).toBe(true);
  });

  it('уход с экрана и сворачивание гасят её на любой стадии', () => {
    for (const stage of ['aim', 'reading', 'answer'] as LabelStage[]) {
      expect(labelCameraOn({ focused: false, appActive: true, stage })).toBe(false);
      expect(labelCameraOn({ focused: true, appActive: false, stage })).toBe(false);
    }
  });
});

describe('showFrozenShot', () => {
  it('после снимка показываем сам снимок, а не живой кадр', () => {
    expect(showFrozenShot({ stage: 'reading', hasShot: true })).toBe(true);
    expect(showFrozenShot({ stage: 'answer', hasShot: true })).toBe(true);
  });

  it('пока целятся — снимка ещё нет', () => {
    expect(showFrozenShot({ stage: 'aim', hasShot: true })).toBe(false);
    expect(showFrozenShot({ stage: 'aim', hasShot: false })).toBe(false);
  });

  it('снимка нет — показывать нечего, даже если камера выключена', () => {
    // Иначе на месте видоискателя остаётся пустой чёрный прямоугольник без
    // объяснения, и экран выглядит сломанным.
    expect(showFrozenShot({ stage: 'reading', hasShot: false })).toBe(false);
  });
});
