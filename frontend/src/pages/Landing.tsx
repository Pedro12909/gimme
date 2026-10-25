import { Link, Navigate, useNavigate } from "react-router";
import { PageShell, Wordmark } from "@/components/page-shell";
import { SendCodeForm } from "@/components/send-code-form";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

// Simple drawings stand in for product photos, so the page needs no external images
const drawings = {
  case: (
    <>
      <ellipse cx="50" cy="70" rx="20" ry="2.6" fill="#000" opacity="0.08" />
      <rect
        x="31"
        y="36"
        width="38"
        height="32"
        rx="11"
        fill="#fbfbfa"
        stroke="#d6d6d2"
        strokeWidth="0.6"
      />
      <line
        x1="31.5"
        y1="47"
        x2="68.5"
        y2="47"
        stroke="#d2d2ce"
        strokeWidth="0.6"
      />
      <circle cx="50" cy="57" r="1.2" fill="#c4c4bf" />
    </>
  ),
  reader: (
    <>
      <ellipse cx="50" cy="79" rx="18" ry="2.4" fill="#000" opacity="0.09" />
      <rect x="33" y="20" width="34" height="57" rx="3" fill="#1e1e1d" />
      <rect x="36.5" y="25" width="27" height="41" fill="#dcdcd6" />
      <rect x="40" y="31" width="20" height="1.4" fill="#a7a7a1" />
      <rect x="40" y="35" width="17" height="1.4" fill="#a7a7a1" />
      <rect x="40" y="39" width="19" height="1.4" fill="#a7a7a1" />
      <rect x="40" y="43" width="14" height="1.4" fill="#a7a7a1" />
    </>
  ),
  moka: (
    <>
      <ellipse cx="50" cy="79" rx="17" ry="2.4" fill="#000" opacity="0.1" />
      <polygon points="36,78 64,78 60,56 40,56" fill="#a8a8a4" />
      <polygon points="40,56 50,56 50,78 36,78" fill="#bcbcb8" />
      <rect x="38" y="53" width="24" height="3.5" fill="#7c7c78" />
      <polygon points="39,53 61,53 57,32 43,32" fill="#9b9b97" />
      <polygon points="43,32 50,32 50,53 39,53" fill="#b1b1ad" />
      <polygon points="42,32 58,32 55,26 45,26" fill="#8a8a86" />
      <rect x="48" y="22" width="4" height="4" fill="#1e1e1d" />
      <path
        d="M60,36 L71,38 L69,52 L59,50"
        fill="none"
        stroke="#1e1e1d"
        strokeWidth="3.5"
      />
    </>
  ),
  record: (
    <>
      <ellipse cx="52" cy="76" rx="26" ry="2.6" fill="#000" opacity="0.08" />
      <circle cx="60" cy="49" r="24" fill="#161616" />
      <circle
        cx="60"
        cy="49"
        r="19"
        fill="none"
        stroke="#2b2b2b"
        strokeWidth="0.6"
      />
      <circle
        cx="60"
        cy="49"
        r="14"
        fill="none"
        stroke="#2b2b2b"
        strokeWidth="0.6"
      />
      <circle cx="60" cy="49" r="7" fill="#d9a441" />
      <rect x="22" y="25" width="45" height="48" fill="#2f4b66" />
      <rect x="28" y="31" width="20" height="2" fill="#e9e4d8" />
      <rect x="28" y="35" width="13" height="2" fill="#e9e4d8" />
      <circle
        cx="52"
        cy="58"
        r="8"
        fill="none"
        stroke="#c9563d"
        strokeWidth="2"
      />
    </>
  ),
  bonsai: (
    <>
      <ellipse cx="50" cy="75" rx="19" ry="2.4" fill="#000" opacity="0.09" />
      <rect x="34" y="64" width="32" height="10" fill="#6b4a3a" />
      <rect x="31" y="61" width="38" height="4" fill="#5a3d30" />
      <path
        d="M50,62 C47,55 55,50 50,40"
        fill="none"
        stroke="#5a4030"
        strokeWidth="3"
      />
      <ellipse cx="39" cy="40" rx="12" ry="7" fill="#4f6b3a" />
      <ellipse cx="61" cy="36" rx="13" ry="7.5" fill="#5f7d45" />
      <ellipse cx="50" cy="28" rx="11" ry="6.5" fill="#56743f" />
    </>
  ),
};

const EXAMPLES: {
  name: string;
  shop: string;
  drawing: keyof typeof drawings;
  taken?: boolean;
}[] = [
  { name: "AirPods Pro 3", shop: "Apple", drawing: "case" },
  { name: "Kindle Paperwhite", shop: "Amazon", drawing: "reader", taken: true },
  { name: "Moka Express, 6 cups", shop: "Bialetti", drawing: "moka" },
  { name: "In Rainbows, LP", shop: "Fnac", drawing: "record", taken: true },
  { name: "Bonsai Tree", shop: "LEGO", drawing: "bonsai" },
];

export default function Landing() {
  const { user, isPending } = useAuth();
  const navigate = useNavigate();

  if (isPending) return null;
  if (user) return <Navigate to="/lists" replace />;

  return (
    <PageShell
      header={
        <>
          <Wordmark />
          <Link
            to="/sign-in"
            className="flex min-h-11 items-center hover:underline hover:underline-offset-3"
          >
            Sign in
          </Link>
        </>
      }
      mainClassName="pt-12 sm:pt-18"
    >
      <h1 className="page-title max-w-[900px] text-[60px] leading-[0.92] [font-stretch:72%] sm:text-[84px] sm:leading-[0.92] lg:text-[104px]">
        Wishlists that keep the surprise
      </h1>
      <p className="mt-7 max-w-[520px] text-lg leading-normal">
        Put things from any shop on a list and send one link. Friends claim what
        they'll give. You never find out who.
      </p>

      <div className="mt-9">
        <SendCodeForm
          onSent={(email, mode) =>
            navigate("/sign-in", { state: { email, mode } })
          }
        />
      </div>

      <p className="mt-16 mb-3 text-[13px] text-muted sm:mt-22">
        What your friends see
      </p>
      <ul className="-mx-4 grid grid-cols-2 gap-x-0.5 gap-y-6 sm:mx-0 sm:grid-cols-3 lg:grid-cols-5">
        {EXAMPLES.map((example, index) => (
          <li
            key={example.name}
            // As many as fit one row (two on phones)
            className={cn(
              index === 3 && "sm:max-lg:hidden",
              index === 4 && "max-lg:hidden",
            )}
          >
            <span
              aria-hidden="true"
              className="relative block aspect-square bg-photo"
            >
              <svg viewBox="0 0 100 100" className="size-full">
                {drawings[example.drawing]}
              </svg>
              {example.taken && (
                <>
                  <span className="absolute inset-0 bg-veil" />
                  <span className="absolute bottom-2 left-2.5 text-[13px] font-medium">
                    Taken
                  </span>
                </>
              )}
            </span>
            <p className="pt-2 pr-2.5 pl-3 text-sm font-medium sm:pl-0">
              {example.name}
              {example.taken && <span className="sr-only"> (taken)</span>}
            </p>
            <p className="mt-0.5 pl-3 text-xs text-muted sm:pl-0">
              {example.shop}
            </p>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
