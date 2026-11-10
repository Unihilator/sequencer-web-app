import { SmoothScroll } from "@/components/scroll/SmoothScroll";

// Content pages (home, later projects and blog) share smooth scroll.
// The sequencer lives outside this group and keeps native scrolling.
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SmoothScroll />
      {children}
    </>
  );
}
