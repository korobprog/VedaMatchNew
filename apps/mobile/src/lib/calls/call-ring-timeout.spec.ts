import { readFileSync } from 'fs';
import { join } from 'path';
import { SERVER_RING_TIMEOUT_MS, STALE_GRACE_MS } from './stale-native-calls';

/**
 * Порог «звонок застрял» живёт в трёх местах: сервер (таймер дозвона),
 * Kotlin (свой таймер соединения) и JS (решение «занято»/сверка). Разъедутся
 * — нативный звонок снова переживёт серверный. Тест читает исходники, а не
 * импортирует их: мобильный пакет не зависит от `apps/api`, Kotlin в jest не
 * исполняется.
 */
const repoRoot = join(__dirname, '../../../../..');

function readNumber(source: string, pattern: RegExp): number {
  const match = source.match(pattern);
  if (!match) throw new Error(`не найдено: ${pattern}`);
  return Number(match[1].replace(/_/g, ''));
}

describe('таймер дозвона совпадает на сервере, в Kotlin и в JS', () => {
  const server = readFileSync(join(repoRoot, 'apps/api/src/modules/chat/calls/call-state.ts'), 'utf8');
  const kotlin = readFileSync(
    join(repoRoot, 'apps/mobile/modules/vedamatch-calls/android/src/main/java/com/vedamatch/calls/StaleCallPolicy.kt'),
    'utf8',
  );

  it('JS знает серверный RING_TIMEOUT_MS', () => {
    expect(SERVER_RING_TIMEOUT_MS).toBe(readNumber(server, /export const RING_TIMEOUT_MS = ([\d_]+);/));
  });

  it('Kotlin знает серверный RING_TIMEOUT_MS и тот же запас', () => {
    expect(readNumber(kotlin, /const val SERVER_RING_TIMEOUT_MS = ([\d_]+)L/)).toBe(SERVER_RING_TIMEOUT_MS);
    expect(readNumber(kotlin, /const val STALE_GRACE_MS = ([\d_]+)L/)).toBe(STALE_GRACE_MS);
  });
});
