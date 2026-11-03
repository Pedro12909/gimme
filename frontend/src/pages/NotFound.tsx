import { Link } from "react-router";
import { PageShell, Wordmark } from "@/components/page-shell";

export default function NotFound() {
  return (
    <PageShell header={<Wordmark />}>
      <h1 className="page-title">Page not found</h1>
      <Link to="/" className="action mt-2">
        Go to gimme
      </Link>
    </PageShell>
  );
}
