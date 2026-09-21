import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A plain GET form — submitting it navigates to `?{name}=value`, which the
 * server component reads from `searchParams`. No client JS required.
 */
export function SearchInput({
  name = "q",
  placeholder = "Search…",
  defaultValue,
  className,
  action,
  hiddenFields,
}: {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
  action?: string;
  hiddenFields?: Record<string, string>;
}) {
  return (
    <form action={action} className={cn("relative w-full max-w-xs", className)} role="search">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
      <label htmlFor={`search-${name}`} className="sr-only">
        Search
      </label>
      <input
        id={`search-${name}`}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={cn(
          "border-input bg-card placeholder:text-muted-foreground h-11 w-full rounded-xl border py-2 pr-4 pl-10 text-sm shadow-xs outline-none transition-[color,box-shadow]",
          "focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
        )}
      />
    </form>
  );
}
