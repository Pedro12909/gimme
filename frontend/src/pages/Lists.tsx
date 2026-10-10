import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronRightIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { AccountMenu } from "@/components/account-menu"
import { ListFormSheet } from "@/components/owner-forms"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Wordmark } from "@/components/wordmark"
import { createList, getLists } from "@/lib/owner-api"

export default function Lists() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data: lists, isPending, error, refetch } = useQuery({
    queryKey: ["lists"],
    queryFn: getLists,
  })

  const create = useMutation({
    mutationFn: createList,
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] })
      setCreating(false)
      // Straight into the new list, where the next step is adding items
      navigate(`/lists/${list.listId}`)
    },
    onError: () => toast.error("Couldn't create the list. Try again."),
  })

  const sorted = [...(lists ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <AccountMenu />
      </header>

      <main className="pt-8">
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="mt-8 h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <div className="py-24 text-center">
            <p className="text-muted-foreground">Couldn't load your lists.</p>
            <Button variant="outline" size="lg" className="mt-6" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Start your first list</h1>
            <p className="mt-2 max-w-xs text-muted-foreground text-pretty">
              Add things you'd love, then share one link with the people who ask.
            </p>
            <Button size="lg" className="mt-8 h-11 px-6" onClick={() => setCreating(true)}>
              <PlusIcon />
              New list
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">Your lists</h1>
              <Button size="lg" onClick={() => setCreating(true)}>
                <PlusIcon />
                New list
              </Button>
            </div>

            <ul className="mt-6 divide-y border-y">
              {sorted.map((list) => (
                <li key={list.listId}>
                  <Link
                    to={`/lists/${list.listId}`}
                    className="-mx-2 flex items-center gap-4 rounded-md px-2 py-4 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{list.title}</p>
                      {list.description && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {list.description}
                        </p>
                      )}
                    </div>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <ListFormSheet
        open={creating}
        onOpenChange={setCreating}
        heading="New list"
        submitLabel="Create list"
        submitting={create.isPending}
        onSave={(input) => create.mutate(input)}
      />
    </>
  )
}
