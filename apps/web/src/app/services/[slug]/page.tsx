import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceDetailPage } from "@/components/landing/ServiceDetailPage";
import { SERVICE_CONTENT, getServiceContent } from "@/lib/service-content";

export function generateStaticParams() {
  return SERVICE_CONTENT.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceContent(slug);
  if (!service) return {};

  // Суффикс « — VedaMatch» для вкладки добавит template из корневого layout;
  // в openGraph шаблон не действует, поэтому там имя полное.
  const title = `${service.name} — VedaMatch`;
  const description = `${service.tagline}. ${service.description}`;
  return {
    title: service.name,
    description,
    openGraph: { title, description },
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getServiceContent(slug);
  if (!service) notFound();

  const otherServices = SERVICE_CONTENT.filter((s) => s.slug !== slug);

  return <ServiceDetailPage service={service} otherServices={otherServices} />;
}
