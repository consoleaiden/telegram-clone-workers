export type BadgeVariant = "live" | "running" | "paused" | "complete" | "error" | "failed" | "idle";

const LABEL: Record<BadgeVariant, string> = {
  live: "实时",
  running: "运行中",
  paused: "已暂停",
  complete: "已完成",
  error: "错误",
  failed: "失败",
  idle: "空闲",
};

export function Badge({ variant, label }: { variant: BadgeVariant; label?: string }) {
  return (
    <span className={`badge badge-${variant}`}>
      <span className="badge-dot" />
      {label ?? LABEL[variant]}
    </span>
  );
}
