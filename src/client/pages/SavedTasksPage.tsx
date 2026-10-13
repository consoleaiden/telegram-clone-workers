import { useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { navigate } from "../lib/router";
import type { SavedTaskSummary } from "../../shared/rpcTypes";

const SCOPE_LABEL: Record<SavedTaskSummary["scope"], string> = {
  live: "仅新消息",
  live_and_backfill: "历史 + 新消息",
  backfill_only: "仅历史消息（一次性）",
};

function summarize(saved: SavedTaskSummary): string {
  const scope = SCOPE_LABEL[saved.scope];
  if (!saved.backfill_mode) return scope;
  const backfill =
    saved.backfill_mode === "lastN" ? `最近 ${saved.n ?? "?"} 条消息` : `ID ${saved.start_id}–${saved.end_id}`;
  return `${scope} · ${backfill}`;
}

export function SavedTasksPage() {
  const { data: saved, loading, refetch } = usePolling(() => api.get<SavedTaskSummary[]>("/api/saved-tasks"), 10000);
  const [confirming, setConfirming] = useState<SavedTaskSummary | null>(null);
  const toast = useToast();

  async function confirmDelete() {
    if (!confirming) return;
    const res = await api.del(`/api/saved-tasks/${confirming.id}`);
    if (res.ok) {
      toast.show("success", "已删除保存的任务");
    } else {
      toast.show("error", res.description);
    }
    setConfirming(null);
    refetch();
  }

  return (
    <div className="content-container">
      <PageHero
        title="已保存的任务模板"
        subtitle="可一键重启的可复用任务配置"
      />

      <div className="card">
        {loading && <div className="skeleton-row" />}
        {!loading && saved?.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            暂无保存的模板——创建任务时使用「保存并启动」即可在此保留一个可复用模板。
          </p>
        )}
        {saved?.map((s) => (
          <div key={s.id} className="task-item" style={{ cursor: "default" }}>
            <div className="task-name">
              <span>
                {s.bot_label} <span className="text-muted">@{s.bot_username}</span>
              </span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={() => navigate(`wizard/from/${s.id}`)}>
                  重启任务
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirming(s)}>
                  删除
                </button>
              </div>
            </div>
            <div className="task-detail">
              <span>{s.source_chat_title ?? s.source_chat_id} → {s.dest_chat_title ?? s.dest_chat_id}</span>
            </div>
            <div className="task-detail">
              <span>{s.token_preview}</span>
              <span>·</span>
              <span>{summarize(s)}</span>
              <span>·</span>
              <span>保存于 {new Date(s.created_at * 1000).toLocaleDateString()}</span>
              {s.task_id && <span> · 已关联到进行中的任务</span>}
            </div>
          </div>
        ))}
      </div>

      {confirming && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <div className="card-header">
            <div className="card-title" style={{ color: "var(--danger)" }}>确认删除</div>
          </div>
          <p style={{ marginBottom: 16 }}>
            删除保存的模板 <strong>{confirming.bot_label}</strong>？这只会移除该模板——不会影响任何正在运行的机器人或实时任务。
          </p>
          <div className="row">
            <button className="btn btn-danger" onClick={confirmDelete}>
              删除模板
            </button>
            <button className="btn btn-secondary" onClick={() => setConfirming(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
