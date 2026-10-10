import { Link, Navigate } from "react-router"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/wordmark"
import { useAuth } from "@/lib/use-auth"

const steps = [
  "Add things you'd love, from any shop.",
  "Share one link with friends and family.",
  "They claim gifts. You never see who got what.",
]

export default function Landing() {
  const { user, isPending } = useAuth()

  if (isPending) return null
  if (user) return <Navigate to="/lists" replace />

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Button asChild variant="ghost" size="lg">
          <Link to="/sign-in">Sign in</Link>
        </Button>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
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

        <Button asChild size="lg" className="mt-12 h-11 w-full sm:w-auto sm:self-start sm:px-6">
          <Link to="/sign-in">Create your list</Link>
        </Button>
      </main>
    </div>
  )
}
