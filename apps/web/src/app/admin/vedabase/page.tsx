import { AdminVedabaseBooks } from "@/components/vedabase/admin/admin-books";

export const metadata = {
  title: "Библиотека — админка",
  robots: { index: false, follow: false },
};

export default function AdminVedabasePage() {
  return <AdminVedabaseBooks />;
}
