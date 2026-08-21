import type {
  InstallEnvironmentRow,
  InstallEnvironmentSummary,
} from '@vedamatch/shared';

function count(rows: InstallEnvironmentRow[]): number {
  return rows.reduce((sum, row) => sum + row.users, 0);
}

/**
 * Сводка по срезу. `deadEnd` — то, ради чего замер и заводился: сколько
 * человек сидит в браузере, где установка настоящего приложения не даст.
 * Строки идут по убыванию, чтобы самая крупная категория читалась первой.
 */
export function summarizeInstallEnvironments(
  rows: InstallEnvironmentRow[],
): InstallEnvironmentSummary {
  return {
    total: count(rows),
    installed: count(rows.filter((row) => row.displayMode !== 'browser')),
    deadEnd: count(rows.filter((row) => !row.standaloneCapable)),
    rows: [...rows].sort((a, b) => b.users - a.users),
  };
}
