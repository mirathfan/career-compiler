export function TagList({ tags, tone = "slate" }: { tags: string[]; tone?: "slate" | "blue" | "amber" }) {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className={`rounded border px-2 py-0.5 text-xs font-semibold ${toneClass}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}
