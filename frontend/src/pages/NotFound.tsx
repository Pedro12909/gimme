import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <PageShell
      header={
        <>
          <Wordmark />
          <ThemeToggle />
        </>
      }
    >
      <div className="py-24 text-center">
        <h1 className="text-lg font-medium">Page not found</h1>
      </div>
    </PageShell>
  );
}
