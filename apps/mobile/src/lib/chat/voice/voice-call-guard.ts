import type { CallPhase } from '@/lib/calls/call-machine';

/**
 * Пересечение голосовых сообщений со звонками (пункт 4 задачи): пока идёт
 * звонок (в любой фазе, кроме отсутствия звонка и его финала), запись
 * недоступна — говорить в трубку и одновременно наговаривать голосовое
 * нельзя физически, оба идут через один микрофон и одну аудиосессию.
 * Входящий звонок дополнительно обрывает то, что уже играло/писалось.
 */
export function canRecordVoice(phase: CallPhase): boolean {
  return phase === 'idle' || phase === 'ended';
}

export function isCallActive(phase: CallPhase): boolean {
  return !canRecordVoice(phase);
}

/** Входящий звонок — единственная фаза, из-за которой стоит прервать чужое действие сразу, без ожидания принятия. */
export function shouldInterruptForIncomingCall(phase: CallPhase): boolean {
  return phase === 'incoming';
}
