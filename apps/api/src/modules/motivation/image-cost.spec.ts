import {
  IMAGE_SIZE,
  estimateImageCostUsd,
  largestSidePx,
} from './image-cost';

describe('image cost', () => {
  it('берёт большую сторону независимо от порядка', () => {
    expect(largestSidePx('1024x1536')).toBe(1536);
    expect(largestSidePx('1536x1024')).toBe(1536);
  });

  it('не разбирает мусор', () => {
    expect(largestSidePx('auto')).toBe(0);
    expect(largestSidePx('1024')).toBe(0);
    expect(largestSidePx('0x1536')).toBe(0);
  });

  it('наш кадр 9:16 идёт по дешёвой ставке', () => {
    expect(estimateImageCostUsd(IMAGE_SIZE)).toBe(0.01);
  });

  it('граница 1792 px включается в дешёвую ставку', () => {
    expect(estimateImageCostUsd('1792x1024')).toBe(0.01);
    expect(estimateImageCostUsd('1793x1024')).toBe(0.02);
  });

  it('2K и 4K стоят вдвое дороже', () => {
    expect(estimateImageCostUsd('2048x3072')).toBe(0.02);
    expect(estimateImageCostUsd('4096x4096')).toBe(0.02);
  });

  it('неразобранный размер считается по верхней ставке', () => {
    expect(estimateImageCostUsd('auto')).toBe(0.02);
  });
});
