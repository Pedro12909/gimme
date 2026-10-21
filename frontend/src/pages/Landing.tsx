import { Link, Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { PageShell } from "@/components/page-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AddItemDemo,
  AppBackdrop,
  ShareDemo,
  SharedListDemo,
  SurpriseDemo,
} from "@/components/landing-demo";
import { useAuth } from "@/lib/use-auth";

const steps = [
  {
    title: "Add things you'd love, from any shop.",
    body: "Paste a link and gimme fetches the name, photo and price. Add sizes, notes and tags, and drag items into the order you like.",
    demo: <AddItemDemo />,
  },
  {
    title: "Share one link with friends and family.",
    body: "Send it however you like. Guests open it in the browser, with no account and nothing to install.",
    demo: <ShareDemo />,
  },
  {
    title: "They claim gifts. You never see who got what.",
    body: "Guests see what's taken so nobody buys the same thing twice. Your view stays the same, so the surprise is safe.",
    demo: <SurpriseDemo />,
  },
];

export default function Landing() {
  const { user, isPending } = useAuth();

  if (isPending) return null;
  if (user) return <Navigate to="/lists" replace />;

  return (
    // Clips the full-width background without breaking the sticky header
    <div className="overflow-x-clip">
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
        mainClassName="pt-0"
      >
        <section className="relative isolate pt-16 pb-12 sm:pt-24">
          <AppBackdrop />

          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Wishlists that keep the surprise.
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground text-pretty">
            Make a list from any shop, share one link, and let friends claim
            gifts without you ever finding out who got what.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 sm:px-6">
              <Link to="/sign-in">Create your list</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 sm:px-6"
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>

          <div className="mt-14">
            <SharedListDemo />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              A shared list, as your guests see it. Try claiming something.
            </p>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 py-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>

          <ol className="mt-10 space-y-16">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="grid items-center gap-6 sm:grid-cols-2 sm:gap-10"
              >
                <div className={index % 2 === 1 ? "sm:order-last" : undefined}>
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <h3 className="mt-1 text-lg font-medium text-balance">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-muted-foreground text-pretty">
                    {step.body}
                  </p>
                </div>
                {step.demo}
              </li>
            ))}
          </ol>
        </section>

        <section className="py-12 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            Your next birthday, sorted.
          </h2>
          <p className="mt-2 text-muted-foreground">
            gimme is invite-only for now. Sign in with an invited email.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-6 h-11 w-full sm:w-auto sm:px-6"
          >
            <Link to="/sign-in">Create your list</Link>
          </Button>
        </section>
      </PageShell>
    </div>
  );
}
