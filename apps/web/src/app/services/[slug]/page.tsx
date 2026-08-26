import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceDetailPage } from "@/components/landing/ServiceDetailPage";
import { getPublicServices } from "@/lib/api";
import { getUnionShowcase } from "@/lib/union-api";
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

  // Имя берётся из каталога, как и на самой странице: иначе заголовок вкладки
  // расходится с h1 после правки названия в админке.
  const name = await catalogName(slug, service.name);
  // Суффикс « — VedaMatch» для вкладки добавит template из корневого layout;
  // в openGraph шаблон не действует, поэтому там имя полное.
  const title = `${name} — VedaMatch`;
  const description = `${service.tagline}. ${service.description}`;
  return {
    title: name,
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
  // Витрина есть только у Знакомств, и упасть она права не имеет: страница
  // сервиса обязана открыться, даже когда API недоступен — макет телефона
  // тогда покажет демонстрационные карточки.
  const showcase =
    slug === "union" ? await getUnionShowcase().catch(() => null) : null;

  return (
    <ServiceDetailPage
      service={service}
      otherServices={otherServices}
      showcase={showcase?.cards ?? []}
    />
  );
}

/** Название из каталога с запасным значением из копирайта. */
async function catalogName(slug: string, fallback: string): Promise<string> {
  const services = await getPublicServices();
  return services?.find((service) => service.slug === slug)?.name ?? fallback;
}
