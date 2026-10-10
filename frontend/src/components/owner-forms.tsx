import { useEffect, useState } from "react"
import { FormSheet } from "@/components/form-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ItemInput, ListInput } from "@/lib/owner-api"
import { safeHref } from "@/lib/links"

// Limits match the owner Lambda's validation
const LIMITS = { listTitle: 100, description: 500, itemTitle: 200, note: 500, url: 2048 }

const fieldClass = "h-11 text-base"
const textareaClass = "min-h-20 text-base"

// Form state resets each time the sheet opens, so a cancelled edit never leaks into the next one
function useFormState<T>(open: boolean, initial: T) {
  const [values, setValues] = useState(initial)

  useEffect(() => {
    if (open) setValues(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when opening
  }, [open])

  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  return [values, set] as const
}

export function ListFormSheet({
  open,
  onOpenChange,
  heading,
  submitLabel,
  initial = { title: "", description: "" },
  submitting,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  heading: string
  submitLabel: string
  initial?: ListInput
  submitting: boolean
  onSave: (input: ListInput) => void
}) {
  const [values, set] = useFormState(open, initial)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      submitLabel={submitLabel}
      submitting={submitting}
      canSubmit={values.title.trim() !== ""}
      onSubmit={() =>
        onSave({ title: values.title.trim(), description: values.description.trim() })
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="list-title">Name</Label>
        <Input
          id="list-title"
          placeholder="Birthday, Christmas, new flat…"
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          maxLength={LIMITS.listTitle}
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="list-description">Note for guests (optional)</Label>
        <Textarea
          id="list-description"
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          maxLength={LIMITS.description}
          className={textareaClass}
        />
      </div>
    </FormSheet>
  )
}

export function ItemFormSheet({
  open,
  onOpenChange,
  heading,
  submitLabel,
  initial = { url: "", title: "", note: "" },
  submitting,
  onSave,
  secondaryAction,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  heading: string
  submitLabel: string
  initial?: ItemInput
  submitting: boolean
  onSave: (input: ItemInput) => void
  secondaryAction?: React.ReactNode
}) {
  const [values, set] = useFormState(open, initial)
  const url = values.url.trim()
  const urlValid = safeHref(url) !== undefined
  // Only complain once something has been typed, never on an empty field
  const showUrlError = url !== "" && !urlValid

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      submitLabel={submitLabel}
      submitting={submitting}
      canSubmit={urlValid}
      onSubmit={() =>
        onSave({ url, title: values.title.trim(), note: values.note.trim() })
      }
      secondaryAction={secondaryAction}
    >
      <div className="grid gap-2">
        <Label htmlFor="item-url">Link</Label>
        <Input
          id="item-url"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={values.url}
          onChange={(event) => set("url", event.target.value)}
          maxLength={LIMITS.url}
          autoComplete="off"
          aria-invalid={showUrlError}
          aria-describedby={showUrlError ? "item-url-error" : undefined}
          className={fieldClass}
        />
        {showUrlError && (
          <p id="item-url-error" className="text-sm text-destructive">
            Paste a full link, starting with https://
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="item-title">Name (optional)</Label>
        <Input
          id="item-title"
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          maxLength={LIMITS.itemTitle}
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="item-note">Note (optional)</Label>
        <Textarea
          id="item-note"
          placeholder="Size, colour, anything that helps"
          value={values.note}
          onChange={(event) => set("note", event.target.value)}
          maxLength={LIMITS.note}
          className={textareaClass}
        />
      </div>
    </FormSheet>
  )
}
