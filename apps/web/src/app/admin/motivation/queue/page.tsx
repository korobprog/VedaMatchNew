import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { QueueBoard } from "@/components/motivation/admin/queue-board";
import {
  getAdminMotivationCategories,
  getAdminMotivationPosts,
} from "@/lib/motivation-api";

export default async function AdminMotivationQueuePage() {
  const [posts, categories] = await Promise.all([
    getAdminMotivationPosts(),
    getAdminMotivationCategories(),
  ]);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Сначала проверьте цитату и пояснение. Изображение создаётся только после
        одобрения текста и публикуется отдельным подтверждением.
      </p>
      <MotivationAdminTabs active="queue" queueCount={posts?.length} />
      <QueueBoard posts={posts} categories={categories ?? []} />
    </>
  );
}
