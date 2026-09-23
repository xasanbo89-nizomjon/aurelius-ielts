"use client";

import { Search } from "lucide-react";

export function BandConversationFilters({
  defaultSearch,
  defaultStatus,
}: {
  defaultSearch?: string;
  defaultStatus?: string;
}) {
  return (
    <form action="/teacher/band-conversation" method="get" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <input
          type="search"
          name="q"
          defaultValue={defaultSearch}
          placeholder="Search by name or email…"
          className="border-input bg-card placeholder:text-muted-foreground h-11 w-full rounded-xl border py-2 pr-4 pl-10 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
        />
      </div>

      <select
        name="status"
        defaultValue={defaultStatus ?? "all"}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border-input bg-card h-11 rounded-xl border px-3 text-sm shadow-xs outline-none"
      >
        <option value="all">All Students</option>
        <option value="active">Active Students</option>
        <option value="inactive">Inactive Students</option>
      </select>

      <button
        type="submit"
        className="border-input bg-card hover:bg-secondary h-11 rounded-xl border px-4 text-sm font-medium transition-colors"
      >
        Search
      </button>
    </form>
  );
}
