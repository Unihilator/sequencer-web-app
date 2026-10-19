import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Playfair_Display } from "next/font/google";
import { openGraph } from "@/lib/seo";
import { siteConfig } from "@/lib/site";
import "./globals.css";

// Variable fonts (one file covers every weight), self-hosted by next/font.
// Cyrillic subsets are required: the site is in Ukrainian.
const display = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "cyrillic"],
  style: ["normal", "italic"],
});

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  // Resolves relative URLs in canonical / Open Graph tags to absolute ones.
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: openGraph(),
};

export const viewport: Viewport = {
  // Matches --background in globals.css (browser UI tint on mobile).
  themeColor: "#0b0c14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uk"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
