import { BadRequestException } from '@nestjs/common';
import {
  motionOptions,
  parseReelVideoOptions,
  REEL_MOTION_PRESETS,
} from './reel-video-options';

describe('parseReelVideoOptions', () => {
  it('treats an empty choice as a silent clip of automatic length', () => {
    expect(parseReelVideoOptions(undefined)).toEqual({
      videoVoice: false,
      videoVoiceName: null,
      videoTrackId: null,
      videoSeconds: null,
      videoPrompt: null,
    });
  });

  it('turns a chosen voice into an enabled narration', () => {
    // «Без голоса» и есть выключенная озвучка: отдельного флага человеку не надо.
    expect(parseReelVideoOptions({ voice: 'Aria' })).toMatchObject({
      videoVoice: true,
      videoVoiceName: 'Aria',
    });
  });

  it('keeps the track and length as chosen', () => {
    expect(
      parseReelVideoOptions({ trackId: ' track-1 ', seconds: 10 }),
    ).toMatchObject({ videoTrackId: 'track-1', videoSeconds: 10 });
  });

  it('maps a motion preset to a prompt instead of free text', () => {
    expect(parseReelVideoOptions({ motion: 'zoom' }).videoPrompt).toBe(
      REEL_MOTION_PRESETS.zoom.prompt,
    );
  });

  it.each([
    [{ voice: 'Незнакомец' }, 'голос'],
    [{ seconds: 7 }, 'Длина'],
    [{ motion: 'party' }, 'движение'],
  ])('rejects %j', (input, fragment) => {
    expect(() => parseReelVideoOptions(input as never)).toThrow(
      BadRequestException,
    );
    expect(() => parseReelVideoOptions(input as never)).toThrow(fragment);
  });
});

describe('motionOptions', () => {
  it('offers three presets with human labels', () => {
    expect(motionOptions).toHaveLength(3);
    expect(motionOptions.every((option) => option.label.length > 0)).toBe(true);
  });
});
