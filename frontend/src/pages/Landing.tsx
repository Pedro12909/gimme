import { Link, Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/use-auth";

const steps = [
  "Add things you'd love, from any shop.",
  "Share one link with friends and family.",
  "They claim gifts. You never see who got what.",
];

export default function Landing() {
  const { user, isPending } = useAuth();

  if (isPending) return null;
  if (user) return <Navigate to="/lists" replace />;

  return (
    <PageShell
      header={
        <>
          <Wordmark />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="lg">
              <Link to="/sign-in">Sign in</Link>
            </Button>
          </div>
        </>
      }
      mainClassName="flex flex-col justify-center py-16"
    >
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Wishlists that keep the surprise.
      </h1>

      <ol className="mt-10 space-y-4">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-4 text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <Button
        asChild
        size="lg"
        className="mt-12 h-11 w-full sm:w-auto sm:self-start sm:px-6"
      >
        <Link to="/sign-in">Create your list</Link>
      </Button>
    </PageShell>
  );
}
