import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { MotivationAudioManager } from "@/components/motivation/admin/audio-manager";
import { getAdminMotivationAudio } from "@/lib/motivation-api";

export default async function AdminMotivationAudioPage() {
  const items = await getAdminMotivationAudio();

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Фон для чтения: записи играют по кругу, пока человек листает ленту.
        Подложки роликов — в соседней вкладке «Рилсы»: те вшиваются внутрь
        видео, а эти звучат поверх ленты и включаются самим читателем.
      </p>
      <MotivationAdminTabs active="audio" />
      <MotivationAudioManager initial={items} />
    </>
  );
}
