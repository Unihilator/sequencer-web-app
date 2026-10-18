// Single source of truth for site-wide identity and URLs.
export const siteConfig = {
  name: "Roman Derkach",
  title: "Roman Derkach — iOS developer",
  description:
    "Портфоліо iOS-розробника з 15+ роками досвіду: застосунки, експерименти з вебом і онлайн-секвенсер.",
  url: resolveSiteUrl(),
  locale: "uk_UA",
} as const;

// Explicit NEXT_PUBLIC_SITE_URL wins (custom domain). On Vercel, fall back to
// the project's production domain, which Vercel sets for every deployment.
function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
