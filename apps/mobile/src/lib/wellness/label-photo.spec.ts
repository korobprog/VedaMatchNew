import {
  LABEL_MAX_BYTES,
  LABEL_QUALITY_STEPS,
  LABEL_TARGET_SIDE,
  base64Bytes,
  decideLabelShot,
  fitsLabelUpload,
  labelDataUrl,
  pickPictureSize,
} from './label-photo';

/** Список, который реально отдаёт Samsung A51. */
const A51 = [
  '4032x3024',
  '4032x2268',
  '3264x2448',
  '2048x1152',
  '1920x1080',
  '1280x720',
  '640x480',
];

describe('pickPictureSize', () => {
  it('берёт самое маленькое из тех, что не мельче цели', () => {
    // 1920x1080 — первое, у которого длинная сторона ≥ 1600.
    expect(pickPictureSize(A51)).toBe('1920x1080');
  });

  it('мельче цели не берёт: буквы состава перестанут читаться', () => {
    expect(pickPictureSize(A51)).not.toBe('1280x720');
    expect(pickPictureSize(A51)).not.toBe('640x480');
  });

  it('если все меньше цели — берёт самое крупное, а не отказывается снимать', () => {
    expect(pickPictureSize(['640x480', '1280x720'])).toBe('1280x720');
  });

  it('понимает «×» и пробелы, которыми камера иногда разделяет', () => {
    expect(pickPictureSize(['1920 × 1080'])).toBe('1920 × 1080');
  });

  it('мусор в списке пропускает', () => {
    expect(pickPictureSize(['не размер', '1920x1080'])).toBe('1920x1080');
  });

  it('пустой список — null: экран снимет разрешением по умолчанию', () => {
    expect(pickPictureSize([])).toBeNull();
    expect(pickPictureSize(['совсем не размер'])).toBeNull();
  });

  it('цель не ниже той, с которой состав ещё читается', () => {
    expect(LABEL_TARGET_SIDE).toBeGreaterThanOrEqual(1200);
  });
});

describe('base64Bytes и fitsLabelUpload', () => {
  it('считает байты по длине base64', () => {
    expect(base64Bytes('AAAA')).toBe(3);
    expect(base64Bytes('')).toBe(0);
  });

  it('предел тот же, что у сервера', () => {
    expect(LABEL_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(fitsLabelUpload('A'.repeat(1000))).toBe(true);
    expect(fitsLabelUpload('A'.repeat(6 * 1024 * 1024))).toBe(false);
  });

  it('data-URL собирается как ждёт сервер', () => {
    expect(labelDataUrl('QUJD')).toBe('data:image/jpeg;base64,QUJD');
  });
});

describe('decideLabelShot', () => {
  const small = 'A'.repeat(1000);
  const huge = 'A'.repeat(6 * 1024 * 1024);

  it('влезло — отправляем', () => {
    expect(decideLabelShot(small, 0)).toEqual({
      kind: 'send',
      imageDataUrl: labelDataUrl(small),
    });
  });

  it('не влезло на первой попытке — переснимаем качеством пониже', () => {
    expect(decideLabelShot(huge, 0)).toEqual({
      kind: 'retry',
      quality: LABEL_QUALITY_STEPS[1],
    });
  });

  it('качество кончилось — говорим правду, а не жмём дальше', () => {
    const decision = decideLabelShot(huge, 1);
    expect(decision.kind).toBe('too-big');
    expect(decision.kind === 'too-big' && decision.message).toContain('ближе');
  });

  it('вторая попытка с качеством похуже, а не получше', () => {
    expect(LABEL_QUALITY_STEPS[1]).toBeLessThan(LABEL_QUALITY_STEPS[0]);
  });

  it('третьей попытки нет: дело уже не в качестве', () => {
    expect(LABEL_QUALITY_STEPS).toHaveLength(2);
  });
});
