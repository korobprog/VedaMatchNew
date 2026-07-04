import Image from "next/image";
import { notFound } from "next/navigation";
import { getMentorVerificationRequest } from "@/lib/api";
import { MentorVerificationForm } from "@/components/mentor-verification-form";

export default async function MentorVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const request = await getMentorVerificationRequest(token);
  if (!request) notFound();

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo_tilak.png" alt="VedaMatch" width={52} height={52} className="rounded-xl" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Форма наставника
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Подтверждение статуса “Преданный”
            </p>
          </div>
        </div>
        <MentorVerificationForm token={token} request={request} />
      </div>
    </main>
  );
}
