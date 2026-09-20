import { playedBarCount, progressFromTime, ratioFromTouch, timeFromRatio } from './voice-progress';

describe('progressFromTime', () => {
  it('доля от длительности, зажатая в 0..1', () => {
    expect(progressFromTime(0, 10)).toBe(0);
    expect(progressFromTime(5, 10)).toBe(0.5);
    expect(progressFromTime(10, 10)).toBe(1);
    expect(progressFromTime(15, 10)).toBe(1);
    expect(progressFromTime(-5, 10)).toBe(0);
  });

  it('без длительности — ноль, не деление на ноль', () => {
    expect(progressFromTime(3, 0)).toBe(0);
    expect(progressFromTime(3, NaN)).toBe(0);
  });
});

describe('ratioFromTouch', () => {
  it('касание по ширине даёт долю 0..1', () => {
    expect(ratioFromTouch(0, 200)).toBe(0);
    expect(ratioFromTouch(100, 200)).toBe(0.5);
    expect(ratioFromTouch(200, 200)).toBe(1);
  });

  it('касание за пределами дорожки зажимается', () => {
    expect(ratioFromTouch(-10, 200)).toBe(0);
    expect(ratioFromTouch(500, 200)).toBe(1);
  });

  it('без ширины — ноль', () => {
    expect(ratioFromTouch(50, 0)).toBe(0);
  });
});

describe('timeFromRatio', () => {
  it('доля дорожки даёт секунду записи', () => {
    expect(timeFromRatio(0, 40)).toBe(0);
    expect(timeFromRatio(0.5, 40)).toBe(20);
    expect(timeFromRatio(1, 40)).toBe(40);
  });

  it('доля за пределами 0..1 зажимается', () => {
    expect(timeFromRatio(-0.5, 40)).toBe(0);
    expect(timeFromRatio(1.5, 40)).toBe(40);
  });

  it('без длительности — ноль', () => {
    expect(timeFromRatio(0.5, 0)).toBe(0);
  });
});

describe('playedBarCount', () => {
  it('округляет долю столбиков', () => {
    expect(playedBarCount(40, 0)).toBe(0);
    expect(playedBarCount(40, 0.5)).toBe(20);
    expect(playedBarCount(40, 1)).toBe(40);
    expect(playedBarCount(40, 0.024)).toBe(1);
  });

  it('без столбиков — ноль', () => {
    expect(playedBarCount(0, 0.5)).toBe(0);
  });
});
