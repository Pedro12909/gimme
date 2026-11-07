import { PageShell } from "@/components/page-shell";
import { TileGrid } from "@/components/tile";
import { cn } from "@/lib/utils";

// Placeholders shaped like the content that's loading, with a soft shimmer (the .bone style
// in index.css). They show as soon as a page starts waiting.

export function Bone({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("bone block rounded-sm", className)}
    />
  );
}

// Wraps a page's placeholders and tells screen readers what's happening
export function Loading({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// A page title (28px on phones, 36px on desktop) and the meta line under it
export function TitleBones({ meta = true }: { meta?: boolean }) {
  return (
    <>
      <Bone className="h-8 w-3/4 max-w-[400px] sm:h-10" />
      {meta && <Bone className="mt-3 h-3.5 w-44" />}
    </>
  );
}

// Square tiles with a name and a "shop · price" line, like the item grid
export function TileGridBones({
  count = 8,
  narrow = false,
}: {
  count?: number;
  narrow?: boolean;
}) {
  return (
    <TileGrid narrow={narrow}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <Bone className="aspect-square rounded-md" />
          <div className="pt-2">
            <Bone className="h-3.5 w-3/4" />
            <Bone className="mt-1.5 h-3 w-1/2" />
          </div>
        </li>
      ))}
    </TileGrid>
  );
}

// A labelled field, as in the settings and account forms
export function FieldBones({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Bone className="h-3 w-24" />
      <Bone className="mt-2 h-12 w-full max-w-[560px] rounded-md" />
    </div>
  );
}

// A whole page, for when the app is still starting or checking the sign-in and doesn't know
// yet what the page will be. Matches the static copy in index.html.
export function PageSkeleton() {
  return (
    <PageShell
      header={
        <>
          <Bone className="h-4 w-14" />
          <Bone className="h-4 w-24" />
        </>
      }
    >
      <Loading label="Loading">
        <TitleBones />
        <div className="mt-8">
          <TileGridBones />
        </div>
      </Loading>
    </PageShell>
  );
}
