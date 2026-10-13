import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { Badge } from "../components/Badge";
import { PermissionErrorBanner } from "../components/PermissionErrorBanner";
import { navigate } from "../lib/router";
import { useTasks, getTaskDisplayInfo } from "../lib/useTasksContext";
import { formatBytes, getMediaIcon } from "../../shared/messageFilter";
import type { TaskDetail, TaskScope, TaskSummary } from "../../shared/rpcTypes";

interface ActivityEntry {
  id: number;
  kind: "live_forward" | "backfill_batch";
  detail: string | null;
  ok: number;
  error: string | null;
  at: number;
}

export function TaskDetailPage({ taskId }: { taskId: string }) {
  const toast = useToast();
  const { refetch: refetchGlobalTasks } = useTasks();
  const fetchTask = useCallback(() => api.get<TaskDetail>(`/api/tasks/${taskId}`), [taskId]);
  const { data: task, loading, refetch } = usePolling(fetchTask, 4000, [taskId]);

  const fetchActivity = useCallback(() => api.get<ActivityEntry[]>(`/api/tasks/${taskId}/activity`), [taskId]);
  const { data: activity } = usePolling(fetchActivity, 5000, [taskId]);

  const [testCopyResult, setTestCopyResult] = useState<string | null>(null);
  const [testingCopy, setTestingCopy] = useState(false);
  const [testMessageId, setTestMessageId] = useState("");

  // Edit Task Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editScope, setEditScope] = useState<TaskScope>("live");
  const [editStartId, setEditStartId] = useState("");
  const [editEndId, setEditEndId] = useState("");
  const [editCursor, setEditCursor] = useState("");
  const [resetProgress, setResetProgress] = useState(false);
  const [enableFilters, setEnableFilters] = useState(false);
  const [filterMediaTypes, setFilterMediaTypes] = useState<string[]>([]);
  const [minFileSizeMb, setMinFileSizeMb] = useState("");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("");

  function openEditModal() {
    if (!task) return;
    setEditLabel(task.label);
    setEditScope(task.scope);
    setEditStartId(task.start_id != null ? String(task.start_id) : "");
    setEditEndId(task.end_id != null ? String(task.end_id) : "");
    setEditCursor(task.cursor != null ? String(task.cursor) : "");
    setResetProgress(false);

    const hasAnyFilter = Boolean(task.filter_media_types || task.filter_min_size_bytes || task.filter_max_size_bytes);
    setEnableFilters(hasAnyFilter);
    setFilterMediaTypes(task.filter_media_types ? task.filter_media_types.split(",").map((t) => t.trim()).filter(Boolean) : []);
    setMinFileSizeMb(task.filter_min_size_bytes ? String(Math.round(task.filter_min_size_bytes / (1024 * 1024))) : "");
    setMaxFileSizeMb(task.filter_max_size_bytes ? String(Math.round(task.filter_max_size_bytes / (1024 * 1024))) : "");

    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!task) return;

    const wantsBackfill = editScope === "backfill_only" || editScope === "live_and_backfill";
    const wantsLive = editScope === "live" || editScope === "live_and_backfill";

    let startId: number | null = null;
    let endId: number | null = null;
    let cursor: number | null = null;

    if (wantsBackfill) {
      if (!editStartId || !editEndId) {
        toast.show("error", "回填需要填写起始 ID 和结束 ID");
        return;
      }
      startId = Number(editStartId);
      endId = Number(editEndId);
      if (isNaN(startId) || isNaN(endId)) {
        toast.show("error", "起始 ID 和结束 ID 必须是有效数字");
        return;
      }
      if (startId > endId) {
        toast.show("error", "起始 ID 不能大于结束 ID");
        return;
      }
      if (editCursor && !resetProgress) {
        cursor = Number(editCursor);
        if (isNaN(cursor)) {
          toast.show("error", "游标必须是有效数字");
          return;
        }
      }
    }

    const minBytes = wantsLive && enableFilters && minFileSizeMb ? Math.round(Number(minFileSizeMb) * 1024 * 1024) : null;
    const maxBytes = wantsLive && enableFilters && maxFileSizeMb ? Math.round(Number(maxFileSizeMb) * 1024 * 1024) : null;
    const mediaTypesStr = wantsLive && enableFilters && filterMediaTypes.length > 0 ? filterMediaTypes.join(",") : null;

    setSavingEdit(true);
    const res = await api.patch<TaskSummary>(`/api/tasks/${taskId}`, {
      label: editLabel.trim() || undefined,
      scope: editScope,
      startId,
      endId,
      cursor,
      resetProgress,
      filterMediaTypes: mediaTypesStr,
      filterMinSizeBytes: minBytes,
      filterMaxSizeBytes: maxBytes,
    });
    setSavingEdit(false);

    if (res.ok) {
      toast.show("success", "任务更新成功");
      setIsEditing(false);
      refetch();
      refetchGlobalTasks();
    } else {
      toast.show("error", res.description);
    }
  }

  if (!task) {
    if (loading) {
      return (
        <div className="content-container">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      );
    }
    return (
      <div className="content-container">
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>未找到任务</h3>
          <p className="text-muted" style={{ marginBottom: 20 }}>
            无法加载此任务，或该任务已被删除。
          </p>
          <button className="btn btn-primary" onClick={() => navigate("")}>
            ← 返回任务列表
          </button>
        </div>
      </div>
    );
  }

  const isBackfillComplete = task.backfill_status === "complete";
  const scannedCount = isBackfillComplete
    ? (task.total ?? 0)
    : Math.min(task.total ?? 0, (task.processed ?? 0) + (task.failed ?? 0));
  const rangeScannedPct =
    task.total && task.total > 0
      ? Math.min(100, Math.round((scannedCount / task.total) * 100))
      : 0;

  async function patch(body: Partial<{ liveEnabled: boolean; backfillStatus: "running" | "paused" | "cancelled" }>) {
    const res = await api.patch<TaskSummary>(`/api/tasks/${taskId}`, body);
    if (res.ok) {
      refetch();
      refetchGlobalTasks();
    } else {
      toast.show("error", res.description);
    }
  }

  async function runTestCopy() {
    if (!task) return;
    setTestingCopy(true);
    setTestCopyResult(null);
    const res = await api.post<{ message_id: number }>(`/api/bots/${task.bot_id}/tasks/${task.id}/test-copy`, {
      messageId: testMessageId ? Number(testMessageId) : undefined,
    });
    setTestingCopy(false);
    setTestCopyResult(
      res.ok
        ? `✓ 已在目标聊天中作为消息 #${res.data.message_id} 发送`
        : `✗ 失败：${res.description}`,
    );
  }

  const displayInfo = task ? getTaskDisplayInfo(task) : null;
  const displayTitle = displayInfo?.title ?? task?.label ?? "";

  async function removeTask() {
    if (!task) return;
    if (!confirm(`删除任务「${displayTitle}」？此操作无法撤销。`)) return;
    const res = await api.del(`/api/tasks/${taskId}`);
    if (res.ok) {
      toast.show("success", "任务已删除");
      refetchGlobalTasks();
      navigate("");
    } else {
      toast.show("error", res.description);
    }
  }

  return (
    <div className="content-container">
      <PageHero
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>{displayTitle}</span>
            {task.stop_reason ? (
              <Badge variant="failed" label="已停止" />
            ) : task.scope === "live_and_backfill" ? (
              <>
                {task.backfill_status === "running" && <Badge variant="running" label="回填中" />}
                {task.backfill_status === "complete" && <Badge variant="complete" label="回填完成" />}
                {task.live_enabled ? (
                  <Badge variant="live" label="实时转发" />
                ) : (
                  <Badge variant="paused" label="实时已暂停" />
                )}
                {task.backfill_status === "paused" && <Badge variant="paused" label="回填已暂停" />}
              </>
            ) : task.live_enabled ? (
              <Badge variant="live" label="实时转发" />
            ) : task.backfill_status === "running" ? (
              <Badge variant="running" label="回填中" />
            ) : task.backfill_status === "paused" ? (
              <Badge variant="paused" label="已暂停" />
            ) : task.backfill_status === "complete" ? (
              <Badge variant="complete" label="已完成" />
            ) : task.backfill_status === "cancelled" ? (
              <Badge variant="idle" label="已取消" />
            ) : !task.live_enabled && task.scope === "live" ? (
              <Badge variant="paused" label="实时已暂停" />
            ) : (
              <Badge variant="idle" label={task.backfill_status ?? "空闲"} />
            )}
          </div>
        }
        subtitle={`范围：${task.scope.replace(/_/g, " ")} · 创建于 ${new Date(task.created_at * 1000).toLocaleString()}`}
      >
        <button className="btn btn-secondary btn-sm" onClick={() => navigate("")}>
          ← 返回任务列表
        </button>
        {task.backfill_status === "running" && (
          <button className="btn btn-secondary btn-sm" onClick={() => patch({ backfillStatus: "paused" })}>
            暂停回填
          </button>
        )}
        {task.backfill_status === "paused" && (
          <button className="btn btn-primary btn-sm" onClick={() => patch({ backfillStatus: "running" })}>
            恢复回填
          </button>
        )}
        {task.scope === "live" && task.live_enabled && (
          <button className="btn btn-secondary btn-sm" onClick={() => patch({ liveEnabled: false })}>
            暂停实时
          </button>
        )}
        {task.scope === "live" && !task.live_enabled && (
          <button className="btn btn-primary btn-sm" onClick={() => patch({ liveEnabled: true })}>
            恢复实时
          </button>
        )}
        {task.scope === "live_and_backfill" && !task.live_enabled && task.backfill_status === "paused" && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => patch({ liveEnabled: true, backfillStatus: "running" })}
          >
            全部恢复
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={openEditModal}>
          ✏️ 编辑任务
        </button>
        <button className="btn btn-danger btn-sm" onClick={removeTask}>
          删除
        </button>
      </PageHero>

      {task.stop_reason && (
        <div className="card">
          <PermissionErrorBanner
            reason={task.stop_reason}
            description={`自 ${
              task.stopped_at ? new Date(task.stopped_at * 1000).toLocaleString() : "未知时间"
            } 起，Telegram 拒绝了该机器人的请求。`}
          />
        </div>
      )}

      {/* Pipeline Execution Card (Zero Duplication) */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">流水线执行</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: task.scope === "backfill_only" || task.scope === "live" ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {/* Section 1: Historical Backfill (if applicable) */}
          {task.scope !== "live" && (
            <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "var(--success)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📦 历史回填</span>
                <span className={`badge ${isBackfillComplete ? "badge-success" : task.backfill_status === "running" ? "badge-accent" : "badge-muted"}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                  {isBackfillComplete ? "100% 完成" : task.backfill_status === "running" ? "运行中" : "已暂停"}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ color: isBackfillComplete ? "var(--success)" : "var(--accent)" }}>
                    {isBackfillComplete ? "✓ 范围已扫描" : `范围已扫描 ${rangeScannedPct}%`}
                  </span>
                  <span className="text-muted" style={{ fontFamily: "var(--font-mono)" }}>
                    {scannedCount.toLocaleString()} / {(task.total ?? 0).toLocaleString()} 个 ID
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--surface-hover)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${isBackfillComplete ? 100 : rangeScannedPct}%`,
                      height: "100%",
                      background: isBackfillComplete ? "var(--success)" : "var(--accent)",
                      borderRadius: "var(--radius-full)",
                      /* impeccable-disable-next-line layout-transition -- progress bar percentage */
                      transition: "width 260ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.8 }}>
                <div>范围：<strong style={{ color: "var(--ink)" }}>ID {(task.start_id ?? 1).toLocaleString()} 至 {(task.end_id ?? 0).toLocaleString()}</strong> {task.cursor != null ? `（游标位于 #${task.cursor.toLocaleString()}）` : ""}</div>
                <div>已复制消息：<strong style={{ color: "var(--ink)" }}>{(task.processed ?? 0).toLocaleString()}</strong></div>
                {task.failed > 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                    （已跳过 {task.failed.toLocaleString()} 个空或已删除的消息 ID）
                  </div>
                )}
                <div>节奏：<strong style={{ color: "var(--ink)" }}>每批约 {task.pacing_batch_size ?? 60} 条消息</strong></div>
              </div>
            </div>
          )}

          {/* Section 2: Live Forwarding (if applicable) */}
          {task.scope !== "backfill_only" && (
            <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "var(--info)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>⚡ 实时自动同步</span>
                <span className={`badge ${task.live_enabled ? "badge-accent" : "badge-muted"}`} style={{ fontSize: 10, padding: "1px 6px" }}>
                  {task.live_enabled ? "已启用（每 1 分钟轮询）" : "已暂停"}
                </span>
              </div>

              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.8 }}>
                <div>已转发：<strong style={{ color: "var(--ink)" }}>{(task.live_processed ?? 0).toLocaleString()} 条消息</strong></div>
                {task.live_skipped ? (
                  <div>已过滤：<strong style={{ color: "var(--warning)" }}>{task.live_skipped.toLocaleString()} 条消息</strong></div>
                ) : null}
                {task.pending_count && task.pending_count > 0 ? (
                  <div>实时缓冲：<strong style={{ color: "var(--info)" }}>已排队 {task.pending_count.toLocaleString()} 条</strong> {task.backfill_status === "running" ? "（等待回填完成）" : ""}</div>
                ) : null}
                {task.filter_media_types || task.filter_min_size_bytes || task.filter_max_size_bytes ? (
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink)", borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
                    过滤器：<strong>{task.filter_media_types ? task.filter_media_types.split(",").map((m) => getMediaIcon(m.trim())).join(", ") : "所有媒体"}</strong>
                    {task.filter_min_size_bytes ? ` (≥ ${formatBytes(task.filter_min_size_bytes)})` : ""}
                    {task.filter_max_size_bytes ? ` (≤ ${formatBytes(task.filter_max_size_bytes)})` : ""}
                  </div>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted)", borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
                    过滤器：<em>无（转发所有收到的消息）</em>
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!!task.stop_reason}
                    onClick={() => patch({ liveEnabled: !task.live_enabled })}
                  >
                    {task.live_enabled ? "暂停实时" : "恢复实时"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Specification Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">任务规格</div>
        </div>
        <div className="task-spec-grid">
          <div className="task-spec-item">
            <div className="task-spec-label">已连接的机器人</div>
            <div className="task-spec-value">@{task.bot_username}</div>
          </div>
          <div className="task-spec-item">
            <div className="task-spec-label">源聊天</div>
            <div className="task-spec-value">{task.source_chat_title || "频道"}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{task.source_chat_id}</div>
          </div>
          <div className="task-spec-item">
            <div className="task-spec-label">目标聊天</div>
            <div className="task-spec-value">{task.dest_chat_title || "频道"}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{task.dest_chat_id}</div>
          </div>
          <div className="task-spec-item">
            <div className="task-spec-label">范围与创建时间</div>
            <div className="task-spec-value">{task.scope.replace(/_/g, " ")}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{new Date(task.created_at * 1000).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Recent Activity & Diagnostic Hub */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">最近活动</div>
        </div>
        {!activity || activity.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>
            暂无活动记录。
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>
            {activity.map((entry) => {
              const isFiltered =
                entry.error?.startsWith("Filtered:") ||
                entry.error?.startsWith("已过滤") ||
                entry.detail?.includes("skipped:") ||
                entry.detail?.includes("已跳过");
              const isBufferQueue =
                entry.detail?.includes("Queued in buffer") || entry.detail?.includes("已进入缓冲队列");
              return (
                <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: entry.ok ? "var(--success)" : isFiltered ? "var(--warning)" : "var(--danger)" }}>
                    {entry.ok ? "✓" : isFiltered ? "⊘" : "✗"}
                  </span>
                  <span className="text-muted">{new Date(entry.at * 1000).toLocaleTimeString()}</span>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 6px",
                      borderRadius: "3px",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.5px",
                      backgroundColor: isFiltered
                        ? "var(--warning-tint)"
                        : isBufferQueue
                        ? "var(--accent-tint)"
                        : entry.kind === "live_forward"
                        ? "var(--success-tint)"
                        : "var(--surface-hover)",
                      color: isFiltered
                        ? "var(--warning)"
                        : isBufferQueue
                        ? "var(--accent)"
                        : entry.kind === "live_forward"
                        ? "var(--success)"
                        : "var(--muted)",
                    }}
                  >
                    {isFiltered ? "已过滤" : isBufferQueue ? "已排队" : entry.kind === "live_forward" ? "实时" : "回填"}
                  </span>
                  <span>{entry.detail}</span>
                  {entry.error && !isFiltered && <span className="text-danger">— {entry.error}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Diagnostic Tool: Send Test Message Copy */}
        <div className="activity-diagnostic-box">
          <div className="activity-diagnostic-header">诊断工具 — 发送测试消息复制</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="消息 ID（可选）"
              value={testMessageId}
              onChange={(e) => setTestMessageId(e.target.value)}
            />
            <button className="btn btn-secondary btn-sm" disabled={testingCopy} onClick={runTestCopy}>
              {testingCopy ? "发送中…" : "发送测试复制"}
            </button>
          </div>
          {testCopyResult && (
            <p className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              {testCopyResult}
            </p>
          )}
        </div>
      </div>

      {/* Edit Task Modal */}
      {isEditing && (
        <div className="modal-backdrop" onClick={() => !savingEdit && setIsEditing(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span>✏️ 编辑任务配置</span>
              </div>
              <button
                className="modal-close"
                disabled={savingEdit}
                onClick={() => setIsEditing(false)}
                title="关闭"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Task Label */}
              <div className="field">
                <label>任务标签</label>
                <input
                  className="input"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder={displayInfo?.routeText || "任务名称 / 标签"}
                />
              </div>

              {/* Scope Selector */}
              <div className="field">
                <label>复制范围</label>
                <select
                  className="input"
                  value={editScope}
                  onChange={(e) => setEditScope(e.target.value as TaskScope)}
                >
                  <option value="live">仅新消息（实时转发）</option>
                  <option value="live_and_backfill">✨ 历史 + 新消息（追赶流）</option>
                  <option value="backfill_only">仅历史消息（一次性历史回填）</option>
                </select>
              </div>

              {/* Backfill Range Card */}
              {(editScope === "backfill_only" || editScope === "live_and_backfill") && (
                <div
                  style={{
                    padding: "14px 16px",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "var(--ink)" }}>
                    📦 回填范围配置
                  </div>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <div className="field" style={{ margin: 0, flex: 1 }}>
                      <label style={{ fontSize: 11 }}>起始 ID</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={editStartId}
                        onChange={(e) => setEditStartId(e.target.value)}
                        placeholder="起始 ID"
                      />
                    </div>
                    <div className="field" style={{ margin: 0, flex: 1 }}>
                      <label style={{ fontSize: 11 }}>结束 ID</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={editEndId}
                        onChange={(e) => setEditEndId(e.target.value)}
                        placeholder="结束 ID"
                      />
                    </div>
                    <div className="field" style={{ margin: 0, flex: 1 }}>
                      <label style={{ fontSize: 11 }}>当前游标</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        disabled={resetProgress}
                        value={resetProgress ? editStartId : editCursor}
                        onChange={(e) => setEditCursor(e.target.value)}
                        placeholder="游标"
                      />
                    </div>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={resetProgress}
                      onChange={(e) => setResetProgress(e.target.checked)}
                    />
                    <span>重置进度计数（0 已复制 / 0 已失败）并从起始 ID 重新开始</span>
                  </label>

                  <p className="text-muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                    ⚡ 批量回填节奏：每分钟 60 条消息，且不使用过滤器，以保留完整的聊天历史。
                  </p>
                </div>
              )}

              {/* Message Filters Card */}
              {editScope !== "backfill_only" && (
                <div
                  style={{
                    padding: "14px 16px",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🔍 {editScope === "live" ? "实时消息过滤器" : "实时流过滤器（阶段 2）"}</span>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={enableFilters}
                        onChange={(e) => setEnableFilters(e.target.checked)}
                      />
                      启用过滤器
                    </label>
                  </div>

                  {editScope === "live_and_backfill" && (
                    <div
                      style={{
                        padding: "8px 10px",
                        background: "var(--accent-tint)",
                        border: "1px solid var(--accent-border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 11.5,
                        color: "var(--ink)",
                        lineHeight: 1.4,
                        marginBottom: 10,
                      }}
                    >
                      • <strong>回填</strong>：以每分钟 60 条消息、无过滤的方式复制完整历史。<br />
                      • <strong>实时流</strong>：回填完成后应用下方过滤器（在此之前会缓冲匹配的消息）。
                    </div>
                  )}

                  {enableFilters && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", display: "block", marginBottom: 4 }}>
                          允许的媒体类型（全部不勾选表示所有媒体）
                        </label>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                          {[
                            { id: "document", label: "📄 文档" },
                            { id: "video", label: "🎬 视频" },
                            { id: "photo", label: "🖼️ 图片" },
                            { id: "audio", label: "🎵 音频" },
                          ].map((mt) => (
                            <label key={mt.id} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={filterMediaTypes.includes(mt.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFilterMediaTypes([...filterMediaTypes, mt.id]);
                                  } else {
                                    setFilterMediaTypes(filterMediaTypes.filter((t) => t !== mt.id));
                                  }
                                }}
                              />
                              {mt.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>最小文件大小（MB）</label>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="例如 10（忽略小于 10 MB 的文件）"
                            value={minFileSizeMb}
                            onChange={(e) => setMinFileSizeMb(e.target.value)}
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ fontSize: 11 }}>最大文件大小（MB，可选）</label>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="例如 500（忽略大于 500 MB 的文件）"
                            value={maxFileSizeMb}
                            onChange={(e) => setMaxFileSizeMb(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary btn-sm"
                disabled={savingEdit}
                onClick={() => setIsEditing(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={savingEdit}
                onClick={handleSaveEdit}
              >
                {savingEdit ? "保存中…" : "保存更改"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
