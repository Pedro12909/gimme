import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  confirmCode,
  NeedsSignInCode,
  resendCode,
  sendCode,
  type CodeMode,
} from "@/lib/auth";
import { authQueryKey, useAuth } from "@/lib/use-auth";

// Cognito sends 8-digit codes for passwordless sign-in and 6-digit codes for sign-up verification
const CODE_LENGTH: Record<CodeMode, number> = { signIn: 8, signUp: 6 };
const RESEND_COOLDOWN_SECONDS = 30;

// Cognito errors arrive with a `name`; map the ones a person can act on to plain language
function errorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";

  switch (name) {
    case "CodeMismatchException":
      return "That code isn't right. Check it and try again.";
    case "ExpiredCodeException":
    case "NotAuthorizedException":
      return "That code has expired. Send a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a few minutes and try again.";
    case "InvalidParameterException":
      return "Enter a valid email address.";
    default:
      return "Something went wrong. Try again.";
  }
}

export default function SignIn() {
  const { user, isPending } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<CodeMode>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const destination =
    (location.state as { from?: string } | null)?.from ?? "/lists";

  if (isPending) return null;
  if (user) return <Navigate to={destination} replace />;

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      setMode(await sendCode(email.trim()));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value: string) => {
    if (!mode || busy) return;
    setBusy(true);
    setError(undefined);

    try {
      await confirmCode(email.trim(), mode, value);
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof NeedsSignInCode) {
        setMode("signIn");
        setCode("");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        toast("Email verified. We sent you one more code to sign in.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!mode) return;
    setError(undefined);

    try {
      await resendCode(email.trim(), mode);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast("New code sent");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const codeLength = mode ? CODE_LENGTH[mode] : 0;

  const changeEmail = () => {
    setMode(undefined);
    setCode("");
    setError(undefined);
  };

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-sm flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header className="flex h-10 items-center justify-between">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col justify-center pb-16">
        {!mode ? (
          <form onSubmit={submitEmail} noValidate>
            <h1 className="text-2xl font-semibold tracking-tight">
              Continue with email
            </h1>
            <p className="mt-2 text-muted-foreground">
              We'll email you a code. No password needed.
            </p>

            <div className="mt-8 grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={error !== undefined}
                aria-describedby={error ? "auth-error" : undefined}
                className="h-11 text-base"
              />
            </div>

            <ErrorText message={error} />

            <Button
              type="submit"
              size="lg"
              className="mt-6 h-11 w-full"
              disabled={busy || !email.includes("@")}
            >
              Continue
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitCode(code);
            }}
            noValidate
          >
            <h1 className="text-2xl font-semibold tracking-tight">
              Check your email
            </h1>
            <p className="mt-2 text-muted-foreground">
              Enter the {codeLength}-digit code we sent to{" "}
              {/* Moves to its own line as a whole; only breaks if longer than a full line */}
              <span className="inline-block max-w-full font-medium text-foreground [overflow-wrap:anywhere]">
                {email.trim()}.
              </span>
            </p>

            <div className="mt-8 grid gap-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={codeLength}
                value={code}
                onChange={(event) => {
                  const digits = event.target.value
                    .replace(/\D/g, "")
                    .slice(0, codeLength);
                  setCode(digits);
                  // Submit as soon as the code is complete, including when pasted or autofilled
                  if (digits.length === codeLength) submitCode(digits);
                }}
                aria-invalid={error !== undefined}
                aria-describedby={error ? "auth-error" : undefined}
                className="h-11 text-center font-mono text-lg tracking-[0.5em]"
              />
            </div>

            <ErrorText message={error} />

            <Button
              type="submit"
              size="lg"
              className="mt-6 h-11 w-full"
              disabled={busy || code.length !== codeLength}
            >
              {busy ? "Signing in…" : "Continue"}
            </Button>

            <div className="mt-6 flex items-center justify-between text-sm">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={changeEmail}
              >
                Use a different email
              </Button>
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={resend}
                disabled={cooldown > 0}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p id="auth-error" role="alert" className="mt-3 text-sm text-destructive">
      {message}
    </p>
  );
}
