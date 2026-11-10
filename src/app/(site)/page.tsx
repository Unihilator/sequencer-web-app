import type { Metadata } from "next";
import Link from "next/link";
import { HERO_TITLE } from "@/components/hero/copy";
import { HeroBackground } from "@/components/hero/HeroBackground";
import { MANIFESTO, TEASER } from "@/components/home/copy";
import { HeroScroll } from "@/components/home/HeroScroll";
import { Manifesto } from "@/components/home/Manifesto";
import { TeaserGrid } from "@/components/home/TeaserGrid";
import { Parallax } from "@/components/scroll/Parallax";
import { Reveal } from "@/components/scroll/Reveal";
import { SplitReveal } from "@/components/scroll/SplitReveal";
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
      <HeroScroll className="relative isolate flex min-h-svh flex-col justify-end overflow-hidden px-gutter pt-24 pb-16">
        <HeroBackground />
        <div data-hero-copy className="flex max-w-2xl flex-col gap-5">
          <p className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
            iOS · звук · веб
          </p>
          <h1 className="font-display text-headline font-medium">
            {HERO_TITLE}
          </h1>
          <p className="max-w-xl text-lg text-foreground/80">
            Онлайн-секвенсер, генеративна графіка та інші експерименти зі звуком
            просто в браузері.
          </p>
          <Link
            href="/sequencer"
            className="w-fit rounded-full bg-accent px-5 py-2 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Спробувати секвенсер
          </Link>
        </div>
      </HeroScroll>

      <Manifesto eyebrow={MANIFESTO.eyebrow} text={MANIFESTO.text} />

      <section className="grid items-center gap-12 px-gutter py-section md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
            {TEASER.eyebrow}
          </p>
          <SplitReveal className="font-display text-headline font-medium">
            {TEASER.title}
          </SplitReveal>
          <Reveal delay={0.2} className="flex flex-col gap-6">
            <p className="max-w-md text-lg text-foreground/80">{TEASER.text}</p>
            <Link
              href="/sequencer"
              className="w-fit rounded-full bg-accent px-5 py-2 font-semibold text-white transition-opacity hover:opacity-90"
            >
              {TEASER.cta}
            </Link>
          </Reveal>
        </div>
        <Parallax speed={0.15}>
          <TeaserGrid />
        </Parallax>
      </section>
    </main>
  );
}
