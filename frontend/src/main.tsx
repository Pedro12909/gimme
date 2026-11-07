import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { PageSkeleton } from "@/components/skeleton";
import { loadConfig } from "@/config";
import SharedList from "@/pages/SharedList";
import NotFound from "@/pages/NotFound";

await loadConfig();

const queryClient = new QueryClient();

// Everything except the guest page is loaded on demand, so guests never download the auth code
const page =
  (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
    Component: (await load()).default,
  });

const router = createBrowserRouter([
  {
    // Shown on first load while the page's code downloads
    HydrateFallback: PageSkeleton,
    children: [
      { path: "/", lazy: page(() => import("@/pages/Landing")) },
      { path: "/sign-in", lazy: page(() => import("@/pages/SignIn")) },
      {
        lazy: page(() => import("@/pages/OwnerLayout")),
        children: [
          // The lists screen is gone: the default list opens at / instead
          { path: "/lists", element: <Navigate to="/" replace /> },
          { path: "/lists/:listId", lazy: page(() => import("@/pages/Home")) },
          { path: "/all", lazy: page(() => import("@/pages/Home")) },
          { path: "/want", lazy: page(() => import("@/pages/Home")) },
          { path: "/got", lazy: page(() => import("@/pages/Home")) },
          {
            path: "/lists/:listId/settings",
            lazy: page(() => import("@/pages/ListSettings")),
          },
          {
            path: "/lists/:listId/preview",
            lazy: page(() => import("@/pages/ListPreview")),
          },
          { path: "/account", lazy: page(() => import("@/pages/Account")) },
          {
            path: "/share-target",
            lazy: page(() => import("@/pages/ShareTarget")),
          },
        ],
      },
      { path: "/s/:token", Component: SharedList },
      { path: "*", Component: NotFound },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
