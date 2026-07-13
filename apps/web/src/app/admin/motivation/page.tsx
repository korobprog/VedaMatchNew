import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MotivationAdminControls } from "@/components/motivation/motivation-admin-controls";
import { getProfile } from "@/lib/api";
import { getAdminMotivationPosts } from "@/lib/motivation-api";

export default async function AdminMotivationPage() {
  const [user, posts] = await Promise.all([getProfile(), getAdminMotivationPosts()]);
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "service-admin") redirect("/");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Управление Motivation</h1>
        <p className="mt-2 max-w-3xl text-zinc-600 dark:text-zinc-400">
          Сначала проверьте точную цитату и пояснение. Изображение создаётся только после одобрения текста и требует отдельного подтверждения перед публикацией.
        </p>
        <MotivationAdminControls posts={posts} />
      </main>
    </div>
  );
}
