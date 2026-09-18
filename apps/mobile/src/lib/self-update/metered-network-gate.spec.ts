import { shouldWarnBeforeDownload } from './metered-network-gate';

describe('shouldWarnBeforeDownload', () => {
  it('Wi-Fi — не предупреждать', () => {
    expect(shouldWarnBeforeDownload({ isWifi: true, isConnected: true })).toBe(false);
  });

  it('мобильный интернет — предупреждать', () => {
    expect(shouldWarnBeforeDownload({ isWifi: false, isConnected: true })).toBe(true);
  });

  it('сети нет вовсе — не предупреждать (закачка и так упадёт сетевой ошибкой)', () => {
    expect(shouldWarnBeforeDownload({ isWifi: false, isConnected: false })).toBe(false);
  });

  it('нет сети, но isWifi=true (нестабильное сочетание от драйвера) — всё равно не предупреждать', () => {
    expect(shouldWarnBeforeDownload({ isWifi: true, isConnected: false })).toBe(false);
  });
});
