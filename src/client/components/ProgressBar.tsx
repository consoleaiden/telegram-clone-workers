export function ProgressBar({
  processed,
  total,
  failed = 0,
}: {
  processed?: number | null;
  total?: number | null;
  failed?: number | null;
}) {
  const p = processed ?? 0;
  const f = failed ?? 0;
  const t = total ?? 0;
  const scanned = p + f;
  const pct = t > 0 ? Math.min(100, Math.round((scanned / t) * 100)) : 0;
  return (
    <div>
      <div className="progress-bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="text-muted"
        style={{
          fontSize: 12,
          marginTop: 6,
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        <span>
          已扫描 {scanned.toLocaleString()} / {t.toLocaleString()} 个 ID · {pct}%
        </span>
        {f > 0 && (
          <span>
            （已复制 {p.toLocaleString()}，已跳过 {f.toLocaleString()}）
          </span>
        )}
      </div>
    </div>
  );
}
