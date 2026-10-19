import type { Metadata } from "next";
import Link from "next/link";
import { HeroBackground } from "@/components/hero/HeroBackground";
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
    <main className="flex flex-1 flex-col">
      {/* The living field is the focus; the text sits quietly at the bottom. */}
      <section className="relative isolate flex min-h-svh flex-col justify-end overflow-hidden px-gutter pt-24 pb-16">
        <HeroBackground />
        <div className="flex max-w-2xl flex-col gap-5">
          <p className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
            iOS · звук · веб
          </p>
          <h1 className="font-display text-headline font-medium">
            {siteConfig.name}
          </h1>
          <p className="max-w-xl text-lg text-foreground/80">
            15+ років роблю iOS-застосунки. Тут експериментую з вебом і звуком.
          </p>
          <Link
            href="/sequencer"
            className="w-fit rounded-full bg-accent px-5 py-2 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Спробувати секвенсер
          </Link>
        </div>
      </section>
    </main>
  );
}
