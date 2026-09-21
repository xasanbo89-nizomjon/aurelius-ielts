"use client";

import { Search } from "lucide-react";

export function ArticleFilters({
  defaultSearch,
  defaultCategory,
  defaultDifficulty,
  categories,
}: {
  defaultSearch?: string;
  defaultCategory?: string;
  defaultDifficulty?: string;
  categories: string[];
}) {
  return (
    <form action="/student/articles" method="get" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <input
          type="search"
          name="q"
          defaultValue={defaultSearch}
          placeholder="Search articles…"
          className="border-input bg-card placeholder:text-muted-foreground h-11 w-full rounded-xl border py-2 pr-4 pl-10 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
        />
      </div>

      <select
        name="category"
        defaultValue={defaultCategory ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border-input bg-card h-11 rounded-xl border px-3 text-sm shadow-xs outline-none"
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>

      <select
        name="difficulty"
        defaultValue={defaultDifficulty ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border-input bg-card h-11 rounded-xl border px-3 text-sm shadow-xs outline-none"
      >
        <option value="">All levels</option>
        <option value="BEGINNER">Beginner</option>
        <option value="INTERMEDIATE">Intermediate</option>
        <option value="ADVANCED">Advanced</option>
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
