import {
  coverCrop,
  MAX_REEL_IMAGE_BYTES,
  reelImageKey,
  reelImageMessage,
  validateReelImage,
} from './reel-image';

const file = (
  overrides: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {},
) => ({
  buffer: Buffer.from('x'),
  mimetype: 'image/jpeg',
  size: 1000,
  ...overrides,
});

describe('validateReelImage', () => {
  it('accepts a normal photo', () => {
    expect(validateReelImage(file())).toBeNull();
  });

  it.each([
    [undefined, 'image_required'],
    [file({ buffer: Buffer.alloc(0) }), 'image_required'],
    [file({ mimetype: 'image/gif' }), 'unsupported_image_type'],
    [file({ size: MAX_REEL_IMAGE_BYTES + 1 }), 'image_file_too_large'],
  ] as const)('rejects %#', (input, expected) => {
    expect(validateReelImage(input)).toBe(expected);
  });
});

describe('reelImageMessage', () => {
  it('speaks to a person, not in codes', () => {
    expect(reelImageMessage('unsupported_image_type')).toContain('JPEG');
    expect(reelImageMessage('image_file_too_large')).toContain('МБ');
    expect(reelImageMessage('image_too_small')).toContain('точек');
  });
});

describe('coverCrop', () => {
  it('cuts the sides of a wide photo and keeps the full height', () => {
    // 1600×900 при 9:16 оставляет узкую вертикальную полосу по центру.
    const crop = coverCrop(1600, 900);

    expect(crop.height).toBe(900);
    expect(crop.width).toBe(Math.round(900 * (1080 / 1920)));
    expect(crop.left).toBe(Math.round((1600 - crop.width) / 2));
    expect(crop.top).toBe(0);
  });

  it('cuts a tall photo towards its upper third', () => {
    const crop = coverCrop(1000, 4000);

    expect(crop.width).toBe(1000);
    expect(crop.height).toBe(Math.round(1000 / (1080 / 1920)));
    expect(crop.left).toBe(0);
    // Смещение вверх: остаётся треть отрезаемого сверху, две трети снизу.
    expect(crop.top).toBe(Math.round((4000 - crop.height) / 3));
  });

  it('leaves an exact 9:16 photo untouched', () => {
    expect(coverCrop(1080, 1920)).toEqual({
      left: 0,
      top: 0,
      width: 1080,
      height: 1920,
    });
  });
});

describe('reelImageKey', () => {
  it('keeps uploads under the post folder and versions them', () => {
    expect(reelImageKey('post-1', 42)).toBe(
      'motivation/uploads/post-1/v42.webp',
    );
  });
});
