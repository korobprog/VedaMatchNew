/**
 * Какая беседа сейчас открыта на экране. Пуш о сообщении в неё не показываем:
 * человек и так видит его в переписке.
 */
let activeConversationId: string | null = null;

export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}

export function isConversationOpen(id: string): boolean {
  return activeConversationId === id;
}
