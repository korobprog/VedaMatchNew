import { canStartCall, showCallButtons } from './call-permission';

const direct = { kind: 'direct' as const, companion: { id: 'u1' }, canWrite: true };

describe('canStartCall', () => {
  it('личная беседа и можно писать — да', () => {
    expect(canStartCall(direct)).toBe(true);
  });

  it('нельзя писать — нет', () => {
    expect(canStartCall({ ...direct, canWrite: false })).toBe(false);
  });

  it('группа или канал — нет, даже если можно писать', () => {
    expect(canStartCall({ ...direct, kind: 'group' })).toBe(false);
    expect(canStartCall({ ...direct, kind: 'channel' })).toBe(false);
  });

  it('нет собеседника — нет', () => {
    expect(canStartCall({ ...direct, companion: null })).toBe(false);
  });
});

describe('showCallButtons', () => {
  it('видно в личной беседе с собеседником независимо от права писать', () => {
    expect(showCallButtons({ kind: 'direct', companion: { id: 'u1' } })).toBe(true);
  });

  it('скрыто в группе/канале или без собеседника', () => {
    expect(showCallButtons({ kind: 'group', companion: { id: 'u1' } })).toBe(false);
    expect(showCallButtons({ kind: 'direct', companion: null })).toBe(false);
  });
});
