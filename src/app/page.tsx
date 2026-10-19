import type { Metadata } from "next";
import Link from "next/link";
import { openGraph } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: openGraph({
    title: siteConfig.title,
    description: siteConfig.description,
    url: "/",
  }),
};

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        {siteConfig.name}
      </h1>
      <p className="max-w-xl text-lg text-foreground/70">
        iOS-розробник із 15+ роками досвіду. Тут скоро зʼявляться мої
        застосунки, статті та онлайн-секвенсер.
      </p>
      <Link
        href="/sequencer"
        className="w-fit rounded-full bg-foreground px-5 py-2 font-medium text-background transition-opacity hover:opacity-90"
      >
        Спробувати секвенсер
      </Link>
    </main>
  );
}
