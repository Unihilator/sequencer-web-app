import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

type OpenGraph = NonNullable<Metadata["openGraph"]>;

// Next.js replaces (does not merge) a parent's `openGraph` when a page sets
// its own, so every page must start from these shared fields.
export function openGraph(overrides: OpenGraph = {}): OpenGraph {
  return {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    ...overrides,
  };
}
