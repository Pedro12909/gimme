import { useState } from "react";
import { authErrorMessage, sendCode, type CodeMode } from "@/lib/auth";

// Email and "Send code" side by side; on the landing page and the sign-in page
export function SendCodeForm({
  onSent,
  autoFocus = false,
}: {
  onSent: (email: string, mode: CodeMode) => void;
  autoFocus?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setError("Enter your email address.");
      return;
    }
    setBusy(true);
    setError(undefined);

    try {
      onSent(trimmed, await sendCode(trimmed));
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="max-w-[520px]">
      <label htmlFor="email" className="block text-[13px] text-muted">
        Your email
      </label>
      <div className="mt-2 flex">
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          autoFocus={autoFocus}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error !== undefined}
          aria-describedby="email-note"
          className="field min-h-[52px] min-w-0 flex-1 border-r-0 px-4"
        />
        <button
          type="submit"
          className="submit min-h-[52px] shrink-0 px-5 text-[15px]"
          disabled={busy}
        >
          {busy ? "Sending…" : "Send code"}
        </button>
      </div>
      <p
        id="email-note"
        role={error ? "alert" : undefined}
        className={
          error
            ? "mt-2.5 text-[13px] font-medium"
            : "mt-2.5 text-[13px] text-muted"
        }
      >
        {error ?? "Invite-only for now. We'll email a code, no password."}
      </p>
    </form>
  );
}
