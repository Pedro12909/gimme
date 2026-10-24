import { useState } from "react";
import { XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Limits match the owner Lambda's validation
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
const MAX_SUGGESTIONS = 8;

const sameTag = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();

// Tags as removable chips, with the list's existing tags offered as suggestions so the same
// tag isn't spelled three different ways
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
}: {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const full = value.length >= MAX_TAGS;

  const add = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    setDraft("");
    if (!tag || full || value.some((existing) => sameTag(existing, tag)))
      return;
    // Reuse the list's spelling when it already has this tag
    onChange([...value, suggestions.find((s) => sameTag(s, tag)) ?? tag]);
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const matches = suggestions
    .filter((tag) => !value.some((selected) => sameTag(selected, tag)))
    .filter((tag) =>
      tag.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase()),
    )
    .slice(0, MAX_SUGGESTIONS);

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected tags">
          {value.map((tag) => (
            <li
              key={tag}
              className="flex h-7 items-center gap-1 rounded-full bg-muted pr-1 pl-3 text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove ${tag}`}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Input
        id={id}
        value={draft}
        disabled={full}
        // A thing and a person: tags are also how a shared list says who each gift is for
        placeholder={
          full ? `Up to ${MAX_TAGS} tags` : "Add a tag, e.g. books or for Ana"
        }
        maxLength={MAX_TAG_LENGTH}
        autoComplete="off"
        enterKeyHint="done"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // A typed tag shouldn't be lost just because the owner tapped elsewhere
          if (draft.trim()) add(draft);
        }}
        onChange={(event) => {
          const text = event.target.value;
          // A comma finishes a tag, which is quicker than Enter on phone keyboards
          if (text.includes(",")) {
            text.split(",").slice(0, -1).forEach(add);
            setDraft(text.split(",").at(-1) ?? "");
          } else {
            setDraft(text);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Enter adds the tag instead of submitting the whole form
            event.preventDefault();
            add(draft);
          } else if (
            event.key === "Backspace" &&
            draft === "" &&
            value.length > 0
          ) {
            remove(value[value.length - 1]);
          }
        }}
        className="h-11 text-base"
      />

      {/* Hidden rather than removed. Taking these out of the page as the field loses focus
          makes the modal's focus trap pull focus to itself, away from the field just tapped. */}
      {suggestions.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap gap-1.5",
            !(focused && matches.length > 0) && "hidden",
          )}
        >
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              hidden={!matches.includes(tag)}
              // Keep focus in the input so tapping several suggestions in a row works
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(tag)}
              className="h-7 rounded-full border border-dashed px-3 text-sm text-muted-foreground hover:border-solid hover:text-foreground"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
