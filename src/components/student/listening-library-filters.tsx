"use client";

import { Search } from "lucide-react";

export function ListeningLibraryFilters({
  defaultSearch,
  defaultAccent,
  defaultLevel,
}: {
  defaultSearch?: string;
  defaultAccent?: string;
  defaultLevel?: string;
}) {
  return (
    <form action="/student/listening-library" method="get" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <input
          type="search"
          name="q"
          defaultValue={defaultSearch}
          placeholder="Search listening…"
          className="border-input bg-card placeholder:text-muted-foreground h-11 w-full rounded-xl border py-2 pr-4 pl-10 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
        />
      </div>

      <select
        name="accent"
        defaultValue={defaultAccent ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border-input bg-card h-11 rounded-xl border px-3 text-sm shadow-xs outline-none"
      >
        <option value="">All accents</option>
        <option value="BRITISH">British</option>
        <option value="AMERICAN">American</option>
        <option value="AUSTRALIAN">Australian</option>
        <option value="CANADIAN">Canadian</option>
      </select>

      <select
        name="level"
        defaultValue={defaultLevel ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border-input bg-card h-11 rounded-xl border px-3 text-sm shadow-xs outline-none"
      >
        <option value="">All levels</option>
        <option value="BEGINNER">Beginner</option>
        <option value="INTERMEDIATE">Intermediate</option>
        <option value="ADVANCED">Advanced</option>
        <option value="IELTS_ACADEMIC">IELTS Academic</option>
      </select>

      <button type="submit" className="border-input bg-card hover:bg-secondary h-11 rounded-xl border px-4 text-sm font-medium transition-colors">
        Search
      </button>
    </form>
  );
}
