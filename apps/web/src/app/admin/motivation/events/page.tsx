import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { EventsManager } from "@/components/motivation/admin/events-manager";
import { getAdminMotivationEvents } from "@/lib/motivation-api";

export default async function AdminMotivationEventsPage() {
  const events = await getAdminMotivationEvents();

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Праздники и памятные даты, ради которых участники могут собрать открытку из своего рилса.
        Даты заводятся на конкретный год: лунный календарь смещается.
      </p>
      <MotivationAdminTabs active="events" />
      <EventsManager events={events} />
    </>
  );
}
