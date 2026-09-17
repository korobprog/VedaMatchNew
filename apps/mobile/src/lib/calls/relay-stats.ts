/**
 * Разбор `RTCPeerConnection.getStats()` — «пошёл ли звонок через TURN».
 * Вынесено из `webrtc-session.ts` в чистую функцию над готовым `Map`
 * (react-native-webrtc отдаёт `getStats()` как настоящий `Map`, как и
 * браузер — `apps/web/src/components/chat/calls/webrtc-session.ts`,
 * `isRelayed()`), чтобы решение «relay или нет» было покрыто тестом без
 * поднятия настоящего `RTCPeerConnection`.
 *
 * По выбранной паре кандидатов: если хоть одна сторона — relay, звонок
 * релейный. `null` — статистика недоступна или пары ещё нет.
 */

interface TransportStat {
  type: 'transport';
  selectedCandidatePairId?: string;
}

interface CandidatePairStat {
  type: 'candidate-pair';
  state?: string;
  selected?: boolean;
  localCandidateId?: string;
  remoteCandidateId?: string;
}

interface CandidateStat {
  type: 'local-candidate' | 'remote-candidate';
  candidateType?: string;
}

export type RtcStatsReport = Map<string, TransportStat | CandidatePairStat | CandidateStat | { type: string }>;

export function relayedFromStats(stats: RtcStatsReport): boolean | null {
  let selected: CandidatePairStat | null = null;

  stats.forEach((report) => {
    if (report.type === 'transport') {
      const transport = report as TransportStat;
      if (transport.selectedCandidatePairId) {
        const pair = stats.get(transport.selectedCandidatePairId) as CandidatePairStat | undefined;
        if (pair) selected = pair;
      }
    }
    if (!selected && report.type === 'candidate-pair') {
      const pair = report as CandidatePairStat;
      if (pair.state === 'succeeded' && pair.selected) selected = pair;
    }
  });

  if (!selected) return null;
  const pair: CandidatePairStat = selected;
  const local = pair.localCandidateId ? (stats.get(pair.localCandidateId) as CandidateStat | undefined) : undefined;
  const remote = pair.remoteCandidateId ? (stats.get(pair.remoteCandidateId) as CandidateStat | undefined) : undefined;
  if (!local && !remote) return null;
  return local?.candidateType === 'relay' || remote?.candidateType === 'relay';
}
