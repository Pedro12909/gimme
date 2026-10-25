import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell, Wordmark } from "@/components/page-shell";
import { SendCodeForm } from "@/components/send-code-form";
import {
  authErrorMessage,
  confirmCode,
  NeedsSignInCode,
  resendCode,
  type CodeMode,
} from "@/lib/auth";
import { authQueryKey, useAuth } from "@/lib/use-auth";

// Cognito sends 8-digit codes for passwordless sign-in and 6-digit codes for sign-up verification
const CODE_LENGTH: Record<CodeMode, number> = { signIn: 8, signUp: 6 };
const RESEND_COOLDOWN_SECONDS = 30;

// Arrives with an email and mode when the code was sent from the landing page,
// and with `from` when sign-in was needed to open a page
type SignInState = { from?: string; email?: string; mode?: CodeMode } | null;

export default function SignIn() {
  const { user, isPending } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = location.state as SignInState;

  const [email, setEmail] = useState(state?.email ?? "");
  const [mode, setMode] = useState(state?.mode);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(mode ? RESEND_COOLDOWN_SECONDS : 0);
  // Said in place for a moment after "Send again"
  const [resent, setResent] = useState(false);
  // Sign-up confirmed, and a second code (to sign in) is on its way
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!resent) return;
    const timer = setTimeout(() => setResent(false), 2000);
    return () => clearTimeout(timer);
  }, [resent]);

  const destination = state?.from ?? "/lists";

  if (isPending) return null;
  if (user) return <Navigate to={destination} replace />;

  const submitCode = async (value: string) => {
    if (!mode || busy) return;
    setBusy(true);
    setError(undefined);

    try {
      await confirmCode(email, mode, value);
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof NeedsSignInCode) {
        setMode("signIn");
        setCode("");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setVerified(true);
      } else {
        setError(authErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!mode) return;
    setError(undefined);

    try {
      await resendCode(email, mode);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  const changeEmail = () => {
    setMode(undefined);
    setCode("");
    setError(undefined);
    setVerified(false);
  };

  const codeLength = mode ? CODE_LENGTH[mode] : 0;

  return (
    <PageShell header={<Wordmark />} mainClassName="pt-12 sm:pt-18">
      {!mode ? (
        <>
          <h1 className="page-title">Sign in</h1>
          <div className="mt-8">
            <SendCodeForm
              autoFocus
              onSent={(sentTo, sentMode) => {
                setEmail(sentTo);
                setMode(sentMode);
                setCooldown(RESEND_COOLDOWN_SECONDS);
              }}
            />
          </div>
        </>
      ) : (
        <div className="max-w-[520px]">
          <h1 className="page-title">Check your email</h1>
          <p className="mt-4 text-[15px] leading-normal">
            {verified
              ? "Email confirmed. We sent one more code, to sign in, to "
              : "We sent a code to "}
            {/* Moves to its own line as a whole; only breaks if longer than a full line */}
            <span className="inline-block max-w-full font-medium [overflow-wrap:anywhere]">
              {email}
            </span>
            .{mode === "signIn" && " It works for 10 minutes."}
          </p>

          <form
            noValidate
            className="mt-8"
            onSubmit={(event) => {
              event.preventDefault();
              submitCode(code);
            }}
          >
            <label htmlFor="code" className="block text-[13px] text-muted">
              Code
            </label>
            <input
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
              aria-describedby={error ? "code-error" : undefined}
              className="field mt-2 min-h-16 border-ink px-4 text-[32px] font-medium tracking-[0.2em]"
            />
            {error && (
              <p
                id="code-error"
                role="alert"
                className="mt-2.5 text-[13px] font-medium"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="submit mt-4 min-h-[52px] w-full text-base"
              disabled={busy || code.length !== codeLength}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted">
            {resent ? (
              "Sent. Check your email again."
            ) : (
              <>
                Nothing yet?{" "}
                <button
                  type="button"
                  className="action text-ink disabled:text-muted"
                  onClick={resend}
                  disabled={cooldown > 0}
                >
                  {cooldown > 0 ? `Send again in ${cooldown}s` : "Send again"}
                </button>{" "}
                or{" "}
                <button
                  type="button"
                  className="action text-ink"
                  onClick={changeEmail}
                >
                  use another email
                </button>
              </>
            )}
          </p>
        </div>
      )}
    </PageShell>
  );
}
