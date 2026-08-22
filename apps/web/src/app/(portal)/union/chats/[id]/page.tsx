import { redirect } from "next/navigation";

type Params = Promise<{ id: string }>;

/**
 * Переписка переехала в сервис «Общение». Адрес беседы совпадает с прежним
 * id заявки — миграция переносила диалоги под тем же идентификатором,
 * поэтому старые ссылки из уведомлений и закладок продолжают работать.
 */
export default async function UnionChatPage({ params }: { params: Params }) {
  const { id } = await params;
  redirect(`/chat/${id}`);
}
