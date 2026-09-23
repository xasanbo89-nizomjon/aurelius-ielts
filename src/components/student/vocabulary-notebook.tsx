"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VocabularyStatus } from "@prisma/client";
import { BookMarked, Search } from "lucide-react";
import { toast } from "sonner";

import { deleteWordAction, updateWordStatusAction } from "@/actions/vocabulary.actions";
import { getWordIntelligenceAction } from "@/actions/vocabulary-ai.actions";
import { useStudyHeartbeat } from "@/hooks/use-study-heartbeat";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { VocabularyCard } from "@/components/student/vocabulary-card";
import { WordDetailsModal, type WordDetailsEntry } from "@/components/student/word-details-modal";

type StatusFilter = "ALL" | VocabularyStatus;
type SortBy = "NEWEST" | "OLDEST" | "AZ" | "ZA";

const FILTERS: { value: StatusFilter; label: string; dotClass?: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNKNOWN", label: "Red", dotClass: "bg-red-500" },
  { value: "LEARNING", label: "Yellow", dotClass: "bg-amber-500" },
  { value: "KNOWN", label: "Blue", dotClass: "bg-blue-500" },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "NEWEST", label: "Newest" },
  { value: "OLDEST", label: "Oldest" },
  { value: "AZ", label: "Alphabetical A–Z" },
  { value: "ZA", label: "Alphabetical Z–A" },
];

export function VocabularyNotebook({ entries }: { entries: WordDetailsEntry[] }) {
  const router = useRouter();
  useStudyHeartbeat("VOCABULARY");
  const [items, setItems] = useState(entries);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("NEWEST");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiRequestedFor = useRef<string | null>(null);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((entry) => {
      if (statusFilter !== "ALL" && entry.status !== statusFilter) return false;
      if (!query) return true;
      const matchesWord = entry.word.toLowerCase().includes(query);
      const matchesTranslation = entry.uzbekTranslation?.toLowerCase().includes(query) ?? false;
      return matchesWord || matchesTranslation;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "NEWEST":
          return b.addedAt.getTime() - a.addedAt.getTime();
        case "OLDEST":
          return a.addedAt.getTime() - b.addedAt.getTime();
        case "AZ":
          return a.word.localeCompare(b.word);
        case "ZA":
          return b.word.localeCompare(a.word);
      }
    });
  }, [items, search, statusFilter, sortBy]);

  const selectedEntry = items.find((entry) => entry.id === selectedId) ?? null;

  // Word Details AI Panel (section 1): auto-generate once, the first time a
  // word with no cached AI insights is opened. Already-cached words render
  // straight from `entries` (server-fetched props) with zero client calls.
  useEffect(() => {
    if (!selectedEntry || selectedEntry.hasAiInsights) {
      setAiError(null);
      return;
    }
    if (aiRequestedFor.current === selectedEntry.id) return;
    aiRequestedFor.current = selectedEntry.id;

    setAiLoading(true);
    setAiError(null);
    void getWordIntelligenceAction(selectedEntry.word).then((result) => {
      setAiLoading(false);
      if (!result.success) {
        setAiError(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === selectedEntry.id ? { ...entry, ...result.data, hasAiInsights: true } : entry
        )
      );
    });
  }, [selectedEntry]);

  async function handleStatusChange(status: VocabularyStatus) {
    if (!selectedEntry || status === selectedEntry.status) return;
    const previous = selectedEntry.status;

    setSavingStatus(true);
    setItems((prev) => prev.map((entry) => (entry.id === selectedEntry.id ? { ...entry, status } : entry)));

    const result = await updateWordStatusAction(selectedEntry.word, status);
    setSavingStatus(false);

    if (!result.success) {
      toast.error(result.error);
      setItems((prev) => prev.map((entry) => (entry.id === selectedEntry.id ? { ...entry, status: previous } : entry)));
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!selectedEntry) return;
    const removed = selectedEntry;

    setDeleting(true);
    setItems((prev) => prev.filter((entry) => entry.id !== removed.id));
    setSelectedId(null);

    const result = await deleteWordAction(removed.word);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      setItems((prev) => [...prev, removed]);
      return;
    }
    toast.success(`"${removed.word}" removed from your vocabulary.`);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search word or translation…"
            className="border-input bg-card placeholder:text-muted-foreground h-11 w-full rounded-xl border py-2 pr-4 pl-10 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
          />
        </div>

        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortBy)}
          className="border-input bg-card h-11 rounded-xl border px-3 text-sm shadow-xs outline-none"
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              statusFilter === filter.value
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border/70 hover:bg-secondary/60"
            )}
          >
            {filter.dotClass && <span className={cn("size-2 rounded-full", filter.dotClass)} />}
            {filter.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Your vocabulary notebook is empty."
          description="Click any word while reading an article to start saving it here."
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title="No matching words found." description="Try a different search or filter." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((entry) => (
            <VocabularyCard key={entry.id} entry={entry} onClick={() => setSelectedId(entry.id)} />
          ))}
        </div>
      )}

      <WordDetailsModal
        entry={selectedEntry}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            // Reset so a word whose AI generation failed gets a fresh attempt next time it's opened.
            aiRequestedFor.current = null;
          }
        }}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        savingStatus={savingStatus}
        deleting={deleting}
        aiLoading={aiLoading}
        aiError={aiError}
      />
    </>
  );
}
