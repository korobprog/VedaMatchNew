import { CollapsibleBlock } from "@/components/motivation/collapsible-block";
import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { QueueBoard } from "@/components/motivation/admin/queue-board";
import { countQueue } from "@/components/motivation/admin/queue-selectors";
import { MotivationWorkerHealthCard } from "@/components/motivation/admin/worker-health";
import {
  getAdminMotivationCategories,
  getAdminMotivationHealth,
  getAdminMotivationPosts,
} from "@/lib/motivation-api";

export default async function AdminMotivationQueuePage() {
  const [posts, categories, health] = await Promise.all([
    getAdminMotivationPosts(),
    getAdminMotivationCategories(),
    getAdminMotivationHealth(),
  ]);

  /* Одна строка вместо панели: пока всё идёт своим чередом, админу нужно
     видеть афоризмы, а не счётчики. Заметное — молчащий воркер, зависшие
     задачи и ошибки — выносится в затравку, чтобы за ним не приходилось
     раскрывать блок. */
  const trouble = [
    health && !health.worker.alive ? "воркер молчит" : null,
    health?.queue.stuck ? `зависли: ${health.queue.stuck}` : null,
    health?.queue.failed ? `ошибки: ${health.queue.failed}` : null,
  ].filter(Boolean);

  return (
    <>
      <MotivationAdminTabs active="queue" queueCount={posts ? countQueue(posts) : undefined} />
      {/* Порядок проверки и состояние воркера — свёрнуты по умолчанию.
          Раньше они занимали два экрана над первой карточкой: до афоризма,
          ради которого сюда и заходят, надо было домотать. */}
      <CollapsibleBlock
        title="Как проверять и что с воркером"
        preview={trouble.length > 0 ? trouble.join(" · ") : "всё идёт своим чередом"}
        tone="framed"
      >
        <p className="mb-3 max-w-3xl text-sm text-text-1">
          Сначала проверьте цитату и пояснение. Изображение создаётся только
          после одобрения текста и публикуется отдельным подтверждением.
        </p>
        <MotivationWorkerHealthCard health={health} />
      </CollapsibleBlock>
      <QueueBoard posts={posts} categories={categories ?? []} />
    </>
  );
}
