import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import "./index.css"
import { loadConfig } from "@/config"
import { Toaster } from "@/components/ui/sonner"
import SharedList from "@/pages/SharedList"
import NotFound from "@/pages/NotFound"

await loadConfig()

const queryClient = new QueryClient()

// Everything except the guest page is loaded on demand, so guests never download the auth code
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
})

const router = createBrowserRouter([
  { path: "/", lazy: page(() => import("@/pages/Landing")) },
  { path: "/sign-in", lazy: page(() => import("@/pages/SignIn")) },
  {
    lazy: page(() => import("@/pages/OwnerLayout")),
    children: [
      { path: "/lists", lazy: page(() => import("@/pages/Lists")) },
      { path: "/lists/:listId", lazy: page(() => import("@/pages/ListDetail")) },
    ],
  },
  { path: "/s/:token", Component: SharedList },
  { path: "*", Component: NotFound },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </QueryClientProvider>
  </StrictMode>,
)
