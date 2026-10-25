import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OwnerHeader, PageShell } from "@/components/page-shell";
import { signOut } from "@/lib/auth";
import { getMe, updateMe, type Me } from "@/lib/owner-api";
import { readThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme";
import { authQueryKey, useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

// Limit matches the owner Lambda's validation
const MAX_NAME_LENGTH = 40;

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "device", label: "Same as this device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function NameForm({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.displayName ?? "");

  const save = useMutation({
    mutationFn: () => updateMe(name.trim()),
    onSuccess: (saved) => queryClient.setQueryData(["me"], saved),
  });

  // "Saved" stands in for the button's label for a moment
  const { isSuccess: saved, reset } = save;
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(reset, 2000);
    return () => clearTimeout(timer);
  }, [saved, reset]);

  return (
    <form
      noValidate
      className="max-w-[520px]"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor="display-name" className="block text-[13px] text-muted">
        Your name
      </label>
      <div className="mt-2 flex">
        <input
          id="display-name"
          type="text"
          placeholder="e.g. Pedro"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="given-name"
          className="field min-h-[52px] min-w-0 flex-1 border-r-0 px-4"
        />
        <button
          type="submit"
          className="submit min-h-[52px] px-5"
          disabled={save.isPending}
        >
          {save.isSuccess ? "Saved" : "Save"}
        </button>
      </div>
      <p className="mt-2.5 text-[13px] text-muted">
        {save.isError
          ? "Couldn't save. Try again."
          : `Guests see it on your lists, as in "${name.trim() || "Pedro"}'s list".`}
      </p>
    </form>
  );
}

export default function Account() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState(readThemeChoice);
  const { data: me, error } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const handleSignOut = async () => {
    await signOut();
    // Leave the signed-in pages first, or the auth guard would bounce to /sign-in instead
    navigate("/", { replace: true });
    // clear() alone drops the cache without telling mounted components, so the signed-in
    // user stayed on screen until a refresh. Setting it to null notifies them.
    queryClient.clear();
    queryClient.setQueryData(authQueryKey, null);
  };

  return (
    <PageShell header={<OwnerHeader />}>
      <h1 className="page-title">Account</h1>

      <div className="mt-8 flex flex-col gap-10">
        {error ? (
          <p className="text-muted">Couldn't load your name.</p>
        ) : (
          me && <NameForm me={me} />
        )}

        <fieldset>
          <legend className="text-[13px] text-muted">Theme</legend>
          <div className="flex flex-wrap gap-x-5">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={theme === option.value}
                onClick={() => {
                  setThemeChoice(option.value);
                  setTheme(option.value);
                }}
                className={cn(
                  "action",
                  theme === option.value ? "font-medium" : "text-muted",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          {user?.signInDetails?.loginId && (
            <p className="text-[13px] text-muted">
              Signed in as{" "}
              <span className="text-ink [overflow-wrap:anywhere]">
                {user.signInDetails.loginId}
              </span>
            </p>
          )}
          <button type="button" className="action" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </PageShell>
  );
}
