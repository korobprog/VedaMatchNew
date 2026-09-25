import {
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
  exitOffset,
  isTap,
  nextPhotoIndex,
  shouldAutoplay,
  stampOpacity,
  swipeDirection,
  tappedPhotoIndex,
  tiltDegrees,
} from './union-gestures';

const still = { x: 0, y: 0 };

describe('swipeDirection', () => {
  it('недобросили — карточка возвращается', () => {
    expect(swipeDirection({ x: SWIPE_DISTANCE - 1, y: 0 }, still)).toBeNull();
    expect(swipeDirection({ x: 0, y: -(SWIPE_DISTANCE - 1) }, still)).toBeNull();
  });

  it('дотащили — решение по стороне', () => {
    expect(swipeDirection({ x: SWIPE_DISTANCE + 1, y: 0 }, still)).toBe('right');
    expect(swipeDirection({ x: -(SWIPE_DISTANCE + 1), y: 0 }, still)).toBe('left');
    expect(swipeDirection({ x: 0, y: -(SWIPE_DISTANCE + 1) }, still)).toBe('up');
  });

  it('короткий быстрый флик засчитывается наравне с долгим перетаскиванием', () => {
    expect(swipeDirection({ x: 30, y: 0 }, { x: SWIPE_VELOCITY + 1, y: 0 })).toBe('right');
    expect(swipeDirection({ x: -30, y: 0 }, { x: -(SWIPE_VELOCITY + 1), y: 0 })).toBe('left');
  });

  it('вниз решения нет — это просто промах', () => {
    expect(swipeDirection({ x: 0, y: 300 }, { x: 0, y: 2000 })).toBeNull();
  });

  it('диагональ вверх-вправо — суперлайк, как на сайте', () => {
    expect(swipeDirection({ x: 150, y: -150 }, still)).toBe('up');
  });
});

describe('движение карточки', () => {
  it('улетает за край экрана в сторону решения', () => {
    expect(exitOffset('right', 400, 800).x).toBeGreaterThan(400);
    expect(exitOffset('left', 400, 800).x).toBeLessThan(-400);
    expect(exitOffset('up', 400, 800).y).toBeLessThan(-800);
  });

  it('наклон растёт до 14° и дальше не идёт', () => {
    expect(tiltDegrees(0)).toBe(0);
    expect(tiltDegrees(100)).toBeCloseTo(7);
    expect(tiltDegrees(-1000)).toBe(-14);
  });

  it('штамп не пугает при дрожании пальца и проявляется к 140 dp', () => {
    expect(stampOpacity(20)).toBe(0);
    expect(stampOpacity(90)).toBeCloseTo(0.5);
    expect(stampOpacity(500)).toBe(1);
  });
});

describe('тап по фото', () => {
  it('дрожание в пределах допуска — тап, больше — уже свайп', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 108, y: 94 })).toBe(true);
    expect(isTap({ x: 100, y: 100 }, { x: 125, y: 100 })).toBe(false);
  });

  it('правая половина — вперёд, левая — назад, по кругу', () => {
    expect(tappedPhotoIndex({ currentIndex: 0, total: 3, tapX: 300, width: 400 })).toBe(1);
    expect(tappedPhotoIndex({ currentIndex: 2, total: 3, tapX: 300, width: 400 })).toBe(0);
    expect(tappedPhotoIndex({ currentIndex: 0, total: 3, tapX: 50, width: 400 })).toBe(2);
  });

  it('без фото индекс — ноль, а не NaN', () => {
    expect(tappedPhotoIndex({ currentIndex: 0, total: 0, tapX: 50, width: 400 })).toBe(0);
  });
});

describe('автолистание', () => {
  it('идёт по кругу и не выходит за границы', () => {
    expect(nextPhotoIndex(0, 3)).toBe(1);
    expect(nextPhotoIndex(2, 3)).toBe(0);
    expect(nextPhotoIndex(9, 3)).toBe(0);
    expect(nextPhotoIndex(0, 0)).toBe(0);
  });

  it('одно фото, «уменьшить движение» и палец на карточке — не листаем', () => {
    expect(shouldAutoplay(3, false)).toBe(true);
    expect(shouldAutoplay(1, false)).toBe(false);
    expect(shouldAutoplay(3, true)).toBe(false);
    expect(shouldAutoplay(3, false, true)).toBe(false);
  });
});
