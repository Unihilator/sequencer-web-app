// Single source of truth for site-wide identity and URLs.
export const siteConfig = {
  name: "Roman Derkach",
  title: "Roman Derkach — iOS developer",
  description:
    "Портфоліо iOS-розробника з 15+ роками досвіду: застосунки, експерименти з вебом і онлайн-секвенсер.",
  // Set NEXT_PUBLIC_SITE_URL in production; falls back to the local dev server.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "uk_UA",
} as const;
