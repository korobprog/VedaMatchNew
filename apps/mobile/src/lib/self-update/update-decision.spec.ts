import { decideUpdate, type UpdateDecisionInput } from './update-decision';
import type { AppManifest } from './manifest-validation';

const manifest: AppManifest = {
  versionName: '0.2.0+aaaaaaa',
  versionCode: 1031,
  sizeBytes: 45_600_000,
  sha256: 'a'.repeat(64),
  url: 'https://storage.example.com/vedamatch-0.2.0-1031.apk',
  commit: 'aaaaaaa',
  builtAt: '2026-09-18T10:00:00Z',
  minAndroid: '7.0',
};

const base: UpdateDecisionInput = {
  selfUpdate: true,
  currentVersionCode: 1030,
  manifest,
  dismissedUntilVersionCode: null,
  now: new Date('2026-09-18T12:00:00Z'),
  manifestFetchedAt: new Date('2026-09-18T11:59:00Z'),
};

describe('decideUpdate', () => {
  it('канал store — hidden, даже если манифест новее и ничего не отклонено (политика магазинов)', () => {
    expect(decideUpdate({ ...base, selfUpdate: false })).toEqual({ kind: 'hidden' });
  });

  it('манифест недоступен (null) на канале site — hidden', () => {
    expect(decideUpdate({ ...base, manifest: null })).toEqual({ kind: 'hidden' });
  });

  it('версии совпадают — up-to-date', () => {
    expect(decideUpdate({ ...base, currentVersionCode: 1031 })).toEqual({ kind: 'up-to-date' });
  });

  it('локальная версия новее манифеста (не должно бывать, но не ломается) — up-to-date', () => {
    expect(decideUpdate({ ...base, currentVersionCode: 1040 })).toEqual({ kind: 'up-to-date' });
  });

  it('манифест новее, ничего не отклонено — available с манифестом', () => {
    expect(decideUpdate(base)).toEqual({ kind: 'available', manifest });
  });

  it('манифест новее, отклонена ровно эта версия — dismissed', () => {
    expect(decideUpdate({ ...base, dismissedUntilVersionCode: 1031 })).toEqual({
      kind: 'dismissed',
      manifest,
    });
  });

  it('манифест новее, отклонена версия ещё новее (уже вышла и её тоже отклонили) — dismissed', () => {
    expect(decideUpdate({ ...base, dismissedUntilVersionCode: 1035 })).toEqual({
      kind: 'dismissed',
      manifest,
    });
  });

  it('манифест новее, отклонённая версия старее манифеста (вышла версия новее отклонённой) — available', () => {
    expect(decideUpdate({ ...base, dismissedUntilVersionCode: 1030 })).toEqual({
      kind: 'available',
      manifest,
    });
  });

  it('канал store перекрывает даже отклонённую версию — всё равно hidden', () => {
    expect(decideUpdate({ ...base, selfUpdate: false, dismissedUntilVersionCode: 1000 })).toEqual({
      kind: 'hidden',
    });
  });
});
