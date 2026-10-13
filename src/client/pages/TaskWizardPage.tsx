import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { CapabilityChecklist } from "../components/CapabilityChecklist";
import { PermissionErrorBanner } from "../components/PermissionErrorBanner";
import { BotActivityModal } from "../components/BotActivityModal";
import { navigate } from "../lib/router";
import { getTaskDisplayInfo } from "../lib/useTasksContext";
import type {
  BotSummary,
  BotVerifyResult,
  ChatLookupResult,
  ErrorReason,
  SavedTaskWithToken,
  TaskScope,
  TaskSummary,
} from "../../shared/rpcTypes";

type BackfillMode = "range" | "lastN";

export function TaskWizardPage({ fromSavedId }: { fromSavedId?: string }) {
  const toast = useToast();
  const { data: bots } = usePolling(() => api.get<BotSummary[]>("/api/bots"), 15000);

  // Step 1: bot
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [newToken, setNewToken] = useState("");
  const [botError, setBotError] = useState<string | null>(null);
  const [savingBot, setSavingBot] = useState(false);
  const [pendingBot, setPendingBot] = useState<{ token: string; bot_id: number; bot_username: string } | null>(null);
  const [botActiveTasks, setBotActiveTasks] = useState<TaskSummary[] | null>(null);
  const [loadingBotTasks, setLoadingBotTasks] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);

  function handleClearBot() {
    setSelectedBotId("");
    setPendingBot(null);
    setBotActiveTasks(null);
    setNewToken("");
    setBotError(null);
  }

  // Step 2: source chat
  const [sourceChatId, setSourceChatId] = useState("");
  const [sourceLookup, setSourceLookup] = useState<ChatLookupResult | null>(null);
  const [sourceError, setSourceError] = useState<{ reason: ErrorReason; description: string } | null>(null);
  const [lookingUpSource, setLookingUpSource] = useState(false);
  const [showAdminTools, setShowAdminTools] = useState(false);
  const [userIdInput, setUserIdInput] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [revokeInviteLinkInput, setRevokeInviteLinkInput] = useState("");

  // Step 3: destination + config
  const [destChatId, setDestChatId] = useState("");
  const [destLookup, setDestLookup] = useState<ChatLookupResult | null>(null);
  const [destError, setDestError] = useState<{ reason: ErrorReason; description: string } | null>(null);
  const [lookingUpDest, setLookingUpDest] = useState(false);
  const [scope, setScope] = useState<TaskScope>("live");
  const [backfillMode, setBackfillMode] = useState<BackfillMode>("lastN");
  const [startId, setStartId] = useState("");
  const [endId, setEndId] = useState("");
  const [n, setN] = useState("100");
  const [duplicate, setDuplicate] = useState<TaskSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastSaveTemplate, setLastSaveTemplate] = useState(false);
  const [testMessageId, setTestMessageId] = useState("");
  const [testCopyResult, setTestCopyResult] = useState<string | null>(null);
  const [testingCopy, setTestingCopy] = useState(false);
  const [enableFilters, setEnableFilters] = useState(false);
  const [filterMediaTypes, setFilterMediaTypes] = useState<string[]>(["document", "video"]);
  const [minFileSizeMb, setMinFileSizeMb] = useState("");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("");

  const selectedBot = bots?.find((b) => b.id === selectedBotId);
  const hasBot = !!selectedBotId || !!pendingBot;
  const wantsBackfill = scope === "live_and_backfill" || scope === "backfill_only";
  const runningBackfillTasks = (botActiveTasks ?? []).filter((t) => t.backfill_status === "running");
  const hasRunningBackfill = runningBackfillTasks.length > 0;

  function botQuery(): string {
    if (pendingBot) return `token=${encodeURIComponent(pendingBot.token)}&botTelegramId=${pendingBot.bot_id}`;
    return `botId=${selectedBotId}`;
  }

  async function handleSelectBot(botId: string) {
    setSelectedBotId(botId);
    setPendingBot(null);
    setBotActiveTasks(null);
    setNewToken("");
    setBotError(null);
    if (!botId) return;
    setLoadingBotTasks(true);
    const res = await api.get<TaskSummary[]>(`/api/bots/${botId}/tasks`);
    setLoadingBotTasks(false);
    if (res.ok) {
      const active = res.data.filter(
        (t) => t.live_enabled || t.backfill_status === "running" || t.backfill_status === "paused",
      );
      setBotActiveTasks(active);
    } else {
      setBotActiveTasks([]);
    }
  }

  useEffect(() => {
    if (!fromSavedId) return;
    (async () => {
      const res = await api.get<SavedTaskWithToken>(`/api/saved-tasks/${fromSavedId}`);
      if (!res.ok) {
        toast.show("error", res.description);
        return;
      }
      const s = res.data;
      setNewToken(s.bot_token);
      setSourceChatId(s.source_chat_id);
      setDestChatId(s.dest_chat_id);
      setScope(s.scope);
      if (s.backfill_mode) setBackfillMode(s.backfill_mode);
      if (s.backfill_mode === "range") {
        setStartId(s.start_id != null ? String(s.start_id) : "");
        setEndId(s.end_id != null ? String(s.end_id) : "");
      } else if (s.backfill_mode === "lastN" && s.n != null) {
        setN(String(s.n));
      }
      if (s.filter_media_types) {
        setEnableFilters(true);
        setFilterMediaTypes(s.filter_media_types.split(",").map((m) => m.trim()).filter(Boolean));
      }
      if (s.filter_min_size_bytes != null) {
        setEnableFilters(true);
        setMinFileSizeMb(String(Math.round(s.filter_min_size_bytes / (1024 * 1024))));
      }
      if (s.filter_max_size_bytes != null) {
        setEnableFilters(true);
        setMaxFileSizeMb(String(Math.round(s.filter_max_size_bytes / (1024 * 1024))));
      }
      toast.show("success", "已从保存的模板预填——请逐步检查并手动继续。");
    })();
  }, [fromSavedId]);

  async function verifyNewBot() {
    if (!newToken.trim()) return;
    setBotError(null);
    setSavingBot(true);
    const res = await api.post<BotVerifyResult>("/api/bots/verify", { token: newToken.trim() });
    setSavingBot(false);
    if (!res.ok) {
      setBotError(res.description);
      return;
    }
    toast.show("success", `已验证 @${res.data.bot_username}`);
    setSelectedBotId("");
    setPendingBot({ token: newToken.trim(), bot_id: res.data.bot_id, bot_username: res.data.bot_username });
    setBotActiveTasks(res.data.active_tasks ?? []);
    setNewToken("");
  }

  async function lookupSource() {
    if (!hasBot || !sourceChatId) return;
    setLookingUpSource(true);
    setSourceError(null);
    setSourceLookup(null);
    const res = await api.get<ChatLookupResult>(`/api/chats/${encodeURIComponent(sourceChatId)}?${botQuery()}`);
    setLookingUpSource(false);
    if (res.ok) setSourceLookup(res.data);
    else setSourceError({ reason: res.reason, description: res.description });
  }

  async function lookupDest() {
    if (!hasBot || !destChatId) return;
    setLookingUpDest(true);
    setDestError(null);
    setDestLookup(null);
    const res = await api.get<ChatLookupResult>(`/api/chats/${encodeURIComponent(destChatId)}?${botQuery()}`);
    setLookingUpDest(false);
    if (res.ok) setDestLookup(res.data);
    else setDestError({ reason: res.reason, description: res.description });
  }

  async function generateInviteLink() {
    const res = await api.post<{ invite_link: string }>(`/api/chats/${encodeURIComponent(sourceChatId)}/invite-link?${botQuery()}`);
    if (res.ok) setInviteLink(res.data.invite_link);
    else toast.show("error", res.description);
  }

  async function revokeInviteLink() {
    if (!revokeInviteLinkInput) return;
    const res = await api.post(`/api/chats/${encodeURIComponent(sourceChatId)}/revoke-invite-link?${botQuery()}`, {
      inviteLink: revokeInviteLinkInput,
    });
    if (res.ok) {
      toast.show("success", "邀请链接已撤销");
      setRevokeInviteLinkInput("");
    } else toast.show("error", res.description);
  }

  async function banUser() {
    const uid = Number(userIdInput);
    if (!uid) return;
    const res = await api.post(`/api/chats/${encodeURIComponent(sourceChatId)}/ban?${botQuery()}`, { userId: uid });
    toast.show(res.ok ? "success" : "error", res.ok ? "用户已被封禁" : res.description);
  }

  async function unbanUser() {
    const uid = Number(userIdInput);
    if (!uid) return;
    const res = await api.post(`/api/chats/${encodeURIComponent(sourceChatId)}/unban?${botQuery()}`, { userId: uid });
    toast.show(res.ok ? "success" : "error", res.ok ? "用户已解除封禁" : res.description);
  }

  async function promoteUser() {
    const uid = Number(userIdInput);
    if (!uid) return;
    const res = await api.post(`/api/chats/${encodeURIComponent(sourceChatId)}/promote?${botQuery()}`, {
      userId: uid,
      rights: { can_delete_messages: true, can_invite_users: true, can_restrict_members: true },
    });
    toast.show(res.ok ? "success" : "error", res.ok ? "用户已提升" : res.description);
  }

  async function sendTestMessage() {
    const res = await api.post(`/api/chats/${encodeURIComponent(sourceChatId)}/send-test-message?${botQuery()}`, {
      text: "来自 Telegram Clone Worker 的测试消息",
    });
    toast.show(res.ok ? "success" : "error", res.ok ? "测试消息已发送" : res.description);
  }

  async function checkLatestId() {
    const res = await api.get<{ latestMessageId: number; cleanupOk: boolean }>(
      `/api/chats/${encodeURIComponent(sourceChatId)}/latest-message-id?${botQuery()}`,
    );
    if (res.ok) toast.show("success", `最新消息 ID：${res.data.latestMessageId}`);
    else toast.show("error", res.description);
  }

  async function runTestCopy() {
    if (!destChatId) return;
    setTestingCopy(true);
    setTestCopyResult(null);
    const res = await api.post<{ message_id: number }>(`/api/chats/${encodeURIComponent(sourceChatId)}/test-copy?${botQuery()}`, {
      destChatId,
      messageId: testMessageId ? Number(testMessageId) : undefined,
    });
    setTestingCopy(false);
    setTestCopyResult(res.ok ? `已在目标聊天中作为消息 ${res.data.message_id} 发送` : `失败：${res.description}`);
  }

  async function createTask(allowDuplicate = false, saveTemplate = false) {
    if (!sourceLookup || !destLookup) return;
    setLastSaveTemplate(saveTemplate);
    setCreating(true);
    setDuplicate(null);
    const wantsLive = scope === "live" || scope === "live_and_backfill";
    const minBytes = wantsLive && enableFilters && minFileSizeMb ? Math.round(Number(minFileSizeMb) * 1024 * 1024) : undefined;
    const maxBytes = wantsLive && enableFilters && maxFileSizeMb ? Math.round(Number(maxFileSizeMb) * 1024 * 1024) : undefined;
    const mediaTypesStr = wantsLive && enableFilters && filterMediaTypes.length > 0 ? filterMediaTypes.join(",") : undefined;

    const body = {
      botToken: pendingBot?.token,
      sourceChatId: String(sourceLookup.chat.id),
      sourceChatTitle: sourceLookup.chat.title,
      destChatId: String(destLookup.chat.id),
      destChatTitle: destLookup.chat.title,
      destChatType: destLookup.chat.type,
      scope,
      backfillMode: wantsBackfill ? backfillMode : undefined,
      startId: wantsBackfill && backfillMode === "range" ? Number(startId) : undefined,
      endId: wantsBackfill && backfillMode === "range" ? Number(endId) : undefined,
      n: wantsBackfill && backfillMode === "lastN" ? Number(n) : undefined,
      allowDuplicate,
      saveTemplate,
      filterMediaTypes: mediaTypesStr,
      filterMinSizeBytes: minBytes,
      filterMaxSizeBytes: maxBytes,
    };
    const botPathId = pendingBot ? "new" : selectedBotId;
    const res = await api.post<TaskSummary>(`/api/bots/${botPathId}/tasks`, body);
    setCreating(false);
    if (res.ok) {
      toast.show("success", "任务已创建");
      navigate(`task/${res.data.id}`);
      return;
    }
    const duplicateTaskId = (res as { duplicateTaskId?: string }).duplicateTaskId;
    if (duplicateTaskId) {
      const dup = await api.get<TaskSummary[]>(`/api/bots/${selectedBotId}/tasks`);
      if (dup.ok) {
        const found = dup.data.find((t) => t.id === duplicateTaskId);
        if (found) setDuplicate(found);
      }
      return;
    }
    toast.show("error", res.description);
  }

  return (
    <div className="content-container">
      <PageHero
        title="新建任务"
        subtitle="连接机器人、指定聊天并配置复制模式"
      >
        <button className="btn btn-secondary" onClick={() => navigate("")}>
          取消
        </button>
      </PageHero>

      {/* Step 1: Bot Selection */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className={`step-pill ${hasBot ? "done" : "active"}`}>
              {hasBot ? "✓" : "1"}
            </span>
            <span>1. 选择 Telegram Bot</span>
          </div>
          {hasBot && <span className="badge badge-live">连接</span>}
        </div>

        {!hasBot ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Primary: Add Telegram Bot Token (Always on top) */}
            <div>
              <div className="field" style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ margin: 0, fontWeight: 600 }}>Telegram 机器人 Token</label>
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "none" }}
                  >
                    从@BotFather获取token ↗
                  </a>
                </div>
                <input
                  className="input"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ…"
                  type="password"
                  autoFocus={!fromSavedId}
                />
              </div>
              <p className="text-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                令牌通过Telegram API直接验证，以检查权限、机器人程序用户名和活动工作负载。
              </p>
              {botError && (
                <div style={{ marginBottom: 10 }}>
                  <PermissionErrorBanner reason="unknown" description={botError} />
                </div>
              )}
              <button
                className="btn btn-primary"
                disabled={!newToken.trim() || savingBot}
                onClick={verifyNewBot}
              >
                {savingBot ? "正在向 Telegram 验证…" : "验证并连接机器人"}
              </button>
            </div>

            {/* Secondary: Choose from Existing Bots (ONLY if bots exist) */}
            {bots && bots.length > 0 && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    margin: "6px 0 14px",
                    color: "var(--text-dim)",
                    fontSize: 11.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 600,
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                  <span>或从已有机器人中选择（{bots.length}）</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                </div>

                <div className="field" style={{ marginBottom: 0 }}>
                  <label>选择已保存的机器人</label>
                  <select
                    className="input"
                    value={selectedBotId}
                    onChange={(e) => handleSelectBot(e.target.value)}
                  >
                    <option value="">选择一个之前保存的机器人…</option>
                    {bots.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} (@{b.bot_username})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Connected Bot summary card */
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: "var(--surface-raised)",
                border: "1px solid color-mix(in oklab, var(--success) 35%, transparent)",
                borderRadius: "var(--radius)",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>🤖</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                    @{selectedBot?.bot_username ?? pendingBot?.bot_username}
                    {selectedBot && (
                      <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                        ({selectedBot.label})
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    {pendingBot ? "已验证新的机器人 token（任务启动时将保存）" : "已连接保存的机器人"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowActivityModal(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  title="检查该机器人还在做什么"
                >
                  🔍 检查该机器人还在做什么
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleClearBot}
                  title="选择其他机器人"
                >
                  更换机器人
                </button>
              </div>
            </div>

            {showActivityModal && (
              <BotActivityModal
                botId={selectedBotId || undefined}
                botToken={pendingBot?.token}
                botUsername={selectedBot?.bot_username ?? pendingBot?.bot_username}
                onClose={() => setShowActivityModal(false)}
                onWebhookDisconnected={() => {
                  if (selectedBotId) handleSelectBot(selectedBotId);
                }}
              />
            )}

            {loadingBotTasks && <div className="skeleton-row" style={{ height: 36 }} />}

            {!loadingBotTasks && botActiveTasks !== null && botActiveTasks.length > 0 && (
              <div
                style={{
                  background: "var(--surface-raised)",
                  border: hasRunningBackfill
                    ? "1px solid color-mix(in oklab, var(--warning) 50%, transparent)"
                    : "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "var(--radius)",
                  padding: "12px 14px",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: hasRunningBackfill ? "var(--warning)" : "var(--ink)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>{hasRunningBackfill ? "⚠️ 该机器人正在执行回填" : "该机器人当前的进行中任务"}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--muted)" }}>({botActiveTasks.length})</span>
                  </span>
                  <span className="badge badge-warning" style={{ fontSize: 11 }}>
                    {hasRunningBackfill ? "回填进行中" : "进行中任务"}
                  </span>
                </div>

                {hasRunningBackfill ? (
                  <div
                    style={{
                      background: "color-mix(in oklab, var(--warning) 12%, transparent)",
                      border: "1px solid color-mix(in oklab, var(--warning) 30%, transparent)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      marginBottom: 10,
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    <p style={{ margin: "0 0 6px", color: "var(--ink)" }}>
                      该机器人当前正在执行历史消息复制，任务为{" "}
                      <strong>{runningBackfillTasks.map((t) => getTaskDisplayInfo(t).title).join(", ")}</strong>。
                      Telegram 对每个机器人 token 都有严格的消息速率限制。对同一个机器人并发执行多个回填会触发严重的 <strong>Telegram 限流（Flood Wait 429）</strong>，导致该机器人的所有任务暂停。
                    </p>
                    <div style={{ fontWeight: 600, color: "var(--warning)" }}>
                      💡 建议：为获得最快的复制速度，<strong>每个回填任务使用一个专属机器人 token</strong>，或等待当前回填完成。
                    </div>
                  </div>
                ) : (
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    该机器人当前正在执行以下任务。你仍然可以给它分配新任务，但高消息量可能会共用 Telegram 的速率限制。
                  </p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {botActiveTasks.map((bt) => {
                    const { title, routeText, isCustomLabel } = getTaskDisplayInfo(bt);
                    const isBtBackfilling = bt.backfill_status === "running";
                    return (
                      <div
                        key={bt.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 10px",
                          background: isBtBackfilling
                            ? "color-mix(in oklab, var(--warning) 10%, var(--surface))"
                            : "var(--surface)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: 12,
                          border: isBtBackfilling
                            ? "1px solid color-mix(in oklab, var(--warning) 40%, transparent)"
                            : "1px solid var(--border-subtle)",
                        }}
                      >
                        <div>
                          <strong style={{ color: "var(--ink)" }}>{title}</strong>
                          {isCustomLabel && (
                            <span className="text-muted" style={{ marginLeft: 8 }}>
                              {routeText}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {isBtBackfilling ? (
                            <span className="badge badge-warning" style={{ fontSize: 10.5 }}>
                              ⚡ 回填中
                            </span>
                          ) : (
                            <span className="badge badge-live" style={{ fontSize: 10.5 }}>
                              {bt.live_enabled ? "实时" : "回填"}
                            </span>
                          )}
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            已复制 {bt.processed}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!loadingBotTasks && botActiveTasks !== null && botActiveTasks.length === 0 && (
              <div
                style={{
                  padding: "8px 12px",
                  background: "var(--success-tint)",
                  border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)",
                  borderRadius: "var(--radius)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: "var(--success)", fontWeight: 700 }}>✓</span>
                <span>
                  <strong>@{selectedBot?.bot_username ?? pendingBot?.bot_username}</strong> 当前处于 <strong>空闲</strong> 状态（0 个进行中任务——完全可用于新任务）。
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Source Chat */}
      {hasBot && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className={`step-pill ${sourceLookup ? "done" : "active"}`}>
                {sourceLookup ? "✓" : "2"}
              </span>
              <span>2. 源聊天 / 频道</span>
            </div>
          </div>

          <div className="field">
            <label>源聊天 ID 或 @用户名</label>
            <div className="row">
              <input
                className="input"
                style={{ flex: 1 }}
                value={sourceChatId}
                onChange={(e) => setSourceChatId(e.target.value)}
                placeholder="例如 -1001234567890 或 @channel"
              />
              <button className="btn btn-secondary" disabled={!sourceChatId || lookingUpSource} onClick={lookupSource}>
                {lookingUpSource ? "检查中…" : "检查"}
              </button>
            </div>
          </div>

          {sourceError && <PermissionErrorBanner reason={sourceError.reason} description={sourceError.description} />}

          {sourceLookup && (
            <div style={{ marginTop: 14 }}>
              <div style={{ background: "var(--surface-raised)", borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 14 }}>
                  {sourceLookup.chat.title ?? sourceLookup.chat.id}
                </p>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {sourceLookup.chat.type} · 机器人状态：<strong>{sourceLookup.botStatus}</strong>
                  {sourceLookup.memberCount !== undefined && ` · ${sourceLookup.memberCount} 名成员`}
                </p>
              </div>

              {/* Group Chat Source Notice (Telegram Bot API Restriction) */}
              {(sourceLookup.chat.type === "group" || sourceLookup.chat.type === "supergroup") && (
                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    borderRadius: "var(--radius)",
                    padding: "12px 14px",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 18, marginTop: 1 }}>⚠️</span>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                      <strong style={{ color: "var(--warning)" }}>群聊来源提示（Telegram Bot API 限制）：</strong>
                      <p style={{ margin: "4px 0 6px", color: "var(--ink)" }}>
                        Telegram 禁止机器人查看或复制群聊中由其他机器人发送的消息（防循环策略）。如果该群依赖其他机器人来发布文件或消息，这些由机器人发布的消息将无法被复制（会被作为<em>「未找到要复制的消息」</em>跳过）。
                      </p>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        💡 <strong>建议：</strong>如果你需要完整地克隆文件，可以考虑使用 <strong>Telegram 频道</strong> 作为来源。频道帖是以频道名义发布的，无论作者是谁，机器人都可以自由复制。
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Previous Task History for this Source Channel */}
              {sourceLookup.pastTasks && sourceLookup.pastTasks.length > 0 ? (
                <div
                  style={{
                    marginBottom: 14,
                    background: "var(--surface-raised)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    borderRadius: "var(--radius)",
                    padding: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--warning)" }}>
                      📋 频道任务历史（{sourceLookup.pastTasks.length} 个历史任务）
                    </span>
                    <span className="badge badge-warning" style={{ fontSize: 11 }}>之前添加过</span>
                  </div>
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                    该频道之前关联过以下任务。请查看已完成的工作和最后复制的消息 ID，以避免重复复制。
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sourceLookup.pastTasks.map((pt) => {
                      const statusLabel = pt.stop_reason
                        ? `已停止（${pt.stop_reason}）`
                        : pt.backfill_status === "complete"
                        ? "已完成"
                        : pt.live_enabled
                        ? "实时转发"
                        : pt.backfill_status;

                      return (
                        <div
                          key={pt.id}
                          style={{
                            background: "var(--surface)",
                            borderRadius: "var(--radius-sm)",
                            padding: "10px 12px",
                            fontSize: 12,
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <strong style={{ fontSize: 12.5, color: "var(--ink)" }}>{pt.label}</strong>
                            <span className="badge" style={{ fontSize: 10.5 }}>{statusLabel}</span>
                          </div>
                          <div className="task-detail" style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
                            <span>目标：<strong>{pt.dest_chat_title ?? pt.dest_chat_id}</strong></span>
                            <span>·</span>
                            <span>机器人：@{pt.bot_username}</span>
                            <span>·</span>
                            <span>模式：{(pt.scope ?? "live").replace(/_/g, " ")}</span>
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                            <span>
                              已复制：<strong>{pt.processed} 条消息</strong>{pt.failed ? `（${pt.failed} 条失败）` : ""}
                            </span>
                            <span>
                              最后复制的消息 ID：{" "}
                              <strong style={{ color: "var(--accent)" }}>
                                {pt.last_copied_message_id != null ? `#${pt.last_copied_message_id}` : "无"}
                              </strong>
                            </span>
                            {pt.start_id != null && pt.end_id != null && (
                              <span>范围：#${pt.start_id} → #{pt.end_id}</span>
                            )}
                            <span>创建于：{new Date(pt.created_at * 1000).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {(() => {
                    const validIds = sourceLookup.pastTasks
                      .map((pt) => pt.last_copied_message_id)
                      .filter((id): id is number => id != null && id > 0);
                    const maxLastId = validIds.length > 0 ? Math.max(...validIds) : 0;
                    if (maxLastId > 0) {
                      return (
                        <div
                          style={{
                            marginTop: 12,
                            padding: "8px 12px",
                            background: "var(--accent-tint)",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--accent-border)",
                            fontSize: 12,
                          }}
                        >
                          💡 <strong>防重复保护：</strong>目前从该频道复制的最大消息 ID 是 <strong>#{maxLastId}</strong>。如果你正在配置新的回填，请将 <strong>起始 ID 设为 #{maxLastId + 1}</strong> 以避免重复复制历史消息。
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              ) : (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "8px 12px",
                    background: "var(--success-tint)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)",
                    fontSize: 12,
                    color: "var(--ink)",
                  }}
                >
                  ✓ <strong>全新频道：</strong>未找到该源频道的历史任务。
                </div>
              )}

              <CapabilityChecklist capabilities={sourceLookup.capabilities} />

              {/* Collapsible Admin Tools Accordion */}
              <div className="accordion">
                <div
                  className="accordion-header"
                  onClick={() => setShowAdminTools((s) => !s)}
                >
                  <span>🛠️ 高级管理工具（邀请、封禁、诊断）</span>
                  <span>{showAdminTools ? "▲" : "▼"}</span>
                </div>
                {showAdminTools && (
                  <div className="accordion-body">
                    <div className="row">
                      <button className="btn btn-secondary btn-sm" onClick={generateInviteLink}>
                        生成邀请链接
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={sendTestMessage}>
                        发送测试消息
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={checkLatestId}>
                        检查最新消息 ID
                      </button>
                    </div>
                    {inviteLink && (
                      <p className="text-mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
                        {inviteLink}
                      </p>
                    )}
                    <div className="row">
                      <input
                        className="input"
                        style={{ maxWidth: 220 }}
                        placeholder="粘贴要撤销的邀请链接"
                        value={revokeInviteLinkInput}
                        onChange={(e) => setRevokeInviteLinkInput(e.target.value)}
                      />
                      <button className="btn btn-secondary btn-sm" onClick={revokeInviteLink} disabled={!revokeInviteLinkInput}>
                        撤销链接
                      </button>
                    </div>
                    <div className="row">
                      <input
                        className="input"
                        style={{ maxWidth: 160 }}
                        placeholder="用户 ID"
                        value={userIdInput}
                        onChange={(e) => setUserIdInput(e.target.value)}
                      />
                      <button className="btn btn-secondary btn-sm" onClick={banUser}>
                        封禁
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={unbanUser}>
                        解除封禁
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={promoteUser}>
                        提升
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Destination & Copy Config */}
      {sourceLookup && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className={`step-pill ${destLookup ? "done" : "active"}`}>
                {destLookup ? "✓" : "3"}
              </span>
              <span>3. 目标聊天与同步模式</span>
            </div>
          </div>

          <div className="field">
            <label>目标聊天</label>
            <div className="row">
              <input
                className="input"
                style={{ flex: 1 }}
                value={destChatId}
                onChange={(e) => setDestChatId(e.target.value)}
                placeholder="例如 -1009876543210 或 @destchannel"
              />
              <button className="btn btn-secondary" disabled={!destChatId || lookingUpDest} onClick={lookupDest}>
                {lookingUpDest ? "检查中…" : "检查"}
              </button>
            </div>
          </div>

          {destError && <PermissionErrorBanner reason={destError.reason} description={destError.description} />}

          {destLookup && (
            <>
              <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
                <strong>{destLookup.chat.title ?? destLookup.chat.id}</strong> —{" "}
                {destLookup.capabilities.find((c) => c.key === "send_message")?.available
                  ? "机器人可在此发送消息 ✓"
                  : "机器人无法在此发送消息 ✗"}
              </p>

              {/* Destination Group Chat Warning for Future Operations */}
              {(destLookup.chat.type === "group" || destLookup.chat.type === "supergroup") && (
                <div
                  style={{
                    background: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    borderRadius: "var(--radius)",
                    padding: "12px 14px",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 18, marginTop: 1 }}>ℹ️</span>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                      <strong style={{ color: "var(--info)" }}>目标是群聊：</strong>
                      <p style={{ margin: "4px 0 6px", color: "var(--ink)" }}>
                        复制到此处的消息将以该机器人的身份发送。<strong>关于后续操作的提醒：</strong>Telegram 的防循环规则禁止机器人复制群聊中由其他机器人发送的消息。如果你或另一个机器人以后尝试将消息从该目标群聊<em>克隆出去</em>，这些由机器人发布的消息将无法被复制。
                      </p>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        💡 <strong>提示：</strong>如果你要创建的是一个永久性的文件归档或镜像，且日后会被其他机器人再次克隆，建议使用 <strong>Telegram 频道</strong>。
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="field">
                <label>复制范围</label>
                <select className="input" value={scope} onChange={(e) => setScope(e.target.value as TaskScope)}>
                  <option value="live">仅新消息（实时转发）</option>
                  <option value="live_and_backfill">✨ 历史 + 新消息（追赶流）</option>
                  <option value="backfill_only">仅历史消息（一次性历史回填）</option>
                </select>

                {wantsBackfill && hasRunningBackfill && (
                  <div
                    style={{
                      margin: "10px 0 6px",
                      padding: "12px 14px",
                      background: "color-mix(in oklab, var(--warning) 12%, transparent)",
                      border: "1px solid color-mix(in oklab, var(--warning) 40%, transparent)",
                      borderRadius: "var(--radius)",
                      fontSize: 12.5,
                      color: "var(--ink)",
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "var(--warning)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⚠️ 限流提示：检测到并发回填</span>
                    </div>
                    <p style={{ margin: "0 0 8px" }}>
                      <strong>@{selectedBot?.bot_username ?? pendingBot?.bot_username}</strong> 已经在为{" "}
                      <strong>{runningBackfillTasks.map((t) => getTaskDisplayInfo(t).title).join(", ")}</strong> 执行历史回填。再给同一个机器人 token 分配回填会瓜分 Telegram 的复制配额，并触发 <strong>Telegram 限流（Flood Wait 429）</strong>。
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>
                        <strong>推荐：</strong>返回第 1 步，从{" "}
                        <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                          @BotFather ↗
                        </a>{" "}
                        连接一个单独的机器人 token（每个回填任务 1 个机器人可避免限流等待）。
                      </li>
                      <li style={{ marginTop: 3 }}>
                        <strong>备选方案：</strong>如果你只需要后续的消息，可将范围切换为 <em>「仅新消息（实时转发）」</em>。
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {wantsBackfill && (
                <div className="field">
                  <label>回填模式</label>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <label className="row" style={{ gap: 6, cursor: "pointer" }}>
                      <input type="radio" checked={backfillMode === "lastN"} onChange={() => setBackfillMode("lastN")} /> 最近 N 条消息
                    </label>
                    <label className="row" style={{ gap: 6, cursor: "pointer" }}>
                      <input type="radio" checked={backfillMode === "range"} onChange={() => setBackfillMode("range")} /> 指定 ID 范围
                    </label>
                  </div>
                  {backfillMode === "lastN" ? (
                    <input className="input" style={{ maxWidth: 160 }} value={n} onChange={(e) => setN(e.target.value)} placeholder="N 条消息" />
                  ) : (
                    <div className="row">
                      <input className="input" style={{ maxWidth: 160 }} value={startId} onChange={(e) => setStartId(e.target.value)} placeholder="起始 ID" />
                      <input className="input" style={{ maxWidth: 160 }} value={endId} onChange={(e) => setEndId(e.target.value)} placeholder="结束 ID" />
                    </div>
                  )}
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    ⚡ 批量回填节奏：每分钟 60 条消息。为保留完整的聊天历史，运行时以最高速度、不使用过滤器。
                  </p>
                </div>
              )}

              {/* Message Filters (Available for Live and Live+Backfill) */}
              {scope !== "backfill_only" && (
                <div
                  style={{
                    margin: "16px 0",
                    padding: "14px 16px",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🔍 {scope === "live" ? "实时消息过滤器" : "实时流过滤器（阶段 2）"}</span>
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

                  {scope === "live_and_backfill" && (
                    <div
                      style={{
                        padding: "10px 12px",
                        background: "var(--accent-tint)",
                        border: "1px solid var(--accent-border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12,
                        color: "var(--ink)",
                        lineHeight: 1.5,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "var(--info)", marginBottom: 3 }}>
                        ℹ️ 两阶段追赶流
                      </div>
                      <div>
                        • <strong>历史回填（阶段 1）</strong>：截至最新 ID 的已有消息将以每分钟 60 条的速度批量复制，<strong>不使用过滤器</strong>，以确保最高速度和完整的聊天历史。
                      </div>
                      <div style={{ marginTop: 3 }}>
                        • <strong>实时消息（阶段 2）</strong>：回填之后的所有新到消息都会按下方过滤器进行判定。回填运行期间，匹配的实时消息会按顺序安全排队。
                      </div>
                    </div>
                  )}

                  {enableFilters && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", display: "block", marginBottom: 6 }}>
                          允许的媒体类型（全部不勾选表示所有媒体）
                        </label>
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
                          {[
                            { id: "document", label: "📄 文档 / 文件" },
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
                        <p className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                         选择特定媒体类型会自动过滤掉纯文本的频道帖。
                        </p>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ fontSize: 12 }}>最小文件大小（MB）</label>
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
                          <label style={{ fontSize: 12 }}>最大文件大小（MB，可选）</label>
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

              <div className="row" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  style={{ maxWidth: 180 }}
                  placeholder="消息 ID（可选）"
                  value={testMessageId}
                  onChange={(e) => setTestMessageId(e.target.value)}
                />
                <button className="btn btn-secondary" disabled={testingCopy} onClick={runTestCopy}>
                  {testingCopy ? "发送中…" : "发送测试复制"}
                </button>
              </div>
              {testCopyResult && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {testCopyResult}
                </p>
              )}

              {duplicate && (
                <div className="permission-banner" style={{ marginTop: 16 }}>
                  <span>⚠</span>
                  <div>
                    从该源到该目标的任务已存在（"{duplicate.label}"）。{" "}
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => createTask(true, lastSaveTemplate)}
                    >
                      仍然创建
                    </button>
                  </div>
                </div>
              )}

              <div className="row" style={{ marginTop: 24 }}>
                <button className="btn btn-primary" disabled={creating} onClick={() => createTask(false, false)}>
                  {creating && !lastSaveTemplate ? "创建中…" : "创建任务"}
                </button>
                <button className="btn btn-secondary" disabled={creating} onClick={() => createTask(false, true)}>
                  {creating && lastSaveTemplate ? "保存中…" : "保存并启动"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
