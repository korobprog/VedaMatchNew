import type { InstallEnvironmentRow } from '@vedamatch/shared';
import { summarizeInstallEnvironments } from './install-environment-summary';

function row(
  overrides: Partial<InstallEnvironmentRow> & { users: number },
): InstallEnvironmentRow {
  return {
    browser: 'chrome',
    platform: 'android',
    displayMode: 'browser',
    standaloneCapable: true,
    ...overrides,
  };
}

describe('summarizeInstallEnvironments', () => {
  it('считает тупиковые браузеры отдельно от установленных', () => {
    const summary = summarizeInstallEnvironments([
      row({ users: 100 }),
      row({ users: 40, displayMode: 'standalone' }),
      row({ users: 60, browser: 'yandex-browser', standaloneCapable: false }),
      // Тот самый плохой ярлык: человек «установил», но приложения не получил.
      row({
        users: 25,
        browser: 'yandex-browser',
        displayMode: 'standalone',
        standaloneCapable: false,
      }),
    ]);

    expect(summary.total).toBe(225);
    expect(summary.installed).toBe(65);
    expect(summary.deadEnd).toBe(85);
  });

  it('ставит самую крупную категорию первой', () => {
    const summary = summarizeInstallEnvironments([
      row({ users: 3, browser: 'safari' }),
      row({ users: 17, browser: 'yandex-browser' }),
      row({ users: 9, browser: 'chrome' }),
    ]);

    expect(summary.rows.map((item) => item.browser)).toEqual([
      'yandex-browser',
      'chrome',
      'safari',
    ]);
  });

  it('не портит переданный массив', () => {
    const rows = [row({ users: 1 }), row({ users: 2, browser: 'safari' })];

    summarizeInstallEnvironments(rows);

    expect(rows[0].users).toBe(1);
  });

  it('переживает пустой срез', () => {
    expect(summarizeInstallEnvironments([])).toEqual({
      total: 0,
      installed: 0,
      deadEnd: 0,
      rows: [],
    });
  });
});
