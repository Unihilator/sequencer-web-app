import type { Metadata } from "next";
import { Sequencer } from "@/components/sequencer/Sequencer";
import { openGraph } from "@/lib/seo";

const title = "Онлайн-секвенсер і драм-машина";
const description =
  "Безкоштовний step-sequencer у браузері: 12 треків — барабани, FX, бас і синт, до 32 кроків, swing, reverb і delay. Підходить для house, techno і drum & bass.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/sequencer" },
  openGraph: openGraph({ title, description, url: "/sequencer" }),
};

export default function SequencerPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-headline font-medium">Секвенсер</h1>
        <p className="max-w-2xl text-muted">{description}</p>
      </header>
      <Sequencer />
    </main>
  );
}
