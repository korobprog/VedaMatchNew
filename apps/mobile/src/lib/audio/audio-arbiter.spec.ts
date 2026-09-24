import {
  announceAudioStart,
  onYield,
  resetAudioArbiterForTests,
  yieldsTo,
  type AudioOwner,
} from './audio-arbiter';

const OWNERS: AudioOwner[] = ['media', 'voice', 'recording', 'ringtone'];

describe('yieldsTo — кто кому уступает', () => {
  it('Медиатека молчит под голосовым, записью и рингтоном', () => {
    expect(yieldsTo('media', 'voice')).toBe(true);
    expect(yieldsTo('media', 'recording')).toBe(true);
    expect(yieldsTo('media', 'ringtone')).toBe(true);
  });

  it('голосовое останавливается, когда включили Медиатеку, запись или звонок', () => {
    expect(yieldsTo('voice', 'media')).toBe(true);
    expect(yieldsTo('voice', 'recording')).toBe(true);
    expect(yieldsTo('voice', 'ringtone')).toBe(true);
  });

  it('рингтон и запись не уступают никому', () => {
    for (const starter of OWNERS) {
      expect(yieldsTo('ringtone', starter)).toBe(false);
      expect(yieldsTo('recording', starter)).toBe(false);
    }
  });

  it('сам себе никто не уступает', () => {
    for (const owner of OWNERS) expect(yieldsTo(owner, owner)).toBe(false);
  });
});

describe('announceAudioStart', () => {
  afterEach(() => resetAudioArbiterForTests());

  it('будит только тех, кто уступает начавшему', () => {
    const media = jest.fn();
    const voice = jest.fn();
    onYield('media', media);
    onYield('voice', voice);

    announceAudioStart('voice');
    expect(media).toHaveBeenCalledWith('voice');
    expect(voice).not.toHaveBeenCalled();

    announceAudioStart('media');
    expect(voice).toHaveBeenCalledWith('media');
    expect(media).toHaveBeenCalledTimes(1);
  });

  it('после отписки не будит', () => {
    const media = jest.fn();
    const off = onYield('media', media);
    off();
    announceAudioStart('ringtone');
    expect(media).not.toHaveBeenCalled();
  });

  it('упавший слушатель не мешает остальным', () => {
    const broken = jest.fn(() => {
      throw new Error('boom');
    });
    const healthy = jest.fn();
    onYield('media', broken);
    onYield('media', healthy);
    expect(() => announceAudioStart('recording')).not.toThrow();
    expect(healthy).toHaveBeenCalledWith('recording');
  });
});
