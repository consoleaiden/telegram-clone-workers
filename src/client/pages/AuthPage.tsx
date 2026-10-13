import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/useAuth";

interface AuthPageProps {
  mode?: "login" | "setup";
  onCancel?: () => void;
}

export function AuthPage({ mode: forceMode, onCancel }: AuthPageProps) {
  const { mode: currentAuthMode, source, login, setup, skipSetup } = useAuth();
  const isSetup = forceMode === "setup" || (currentAuthMode === "open" && forceMode !== "login");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSetup) {
      if (!password || password.length < 4) {
        setError("密码长度至少为 4 个字符");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }

      setSubmitting(true);
      const res = await setup(password);
      setSubmitting(false);
      if (!res.ok) {
        setError(res.error || "保存密码失败");
      } else if (onCancel) {
        onCancel();
      }
    } else {
      if (!password) {
        setError("请输入密码");
        return;
      }

      setSubmitting(true);
      const res = await login(password);
      setSubmitting(false);
      if (!res.ok) {
        setError(res.error || "管理员密码不正确");
      } else if (onCancel) {
        onCancel();
      }
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card" role="dialog" aria-labelledby="auth-title">
        <div className="auth-header">
          <div className="auth-brand-mark" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </div>
          <h1 id="auth-title" className="auth-title">
            {isSetup ? "保护你的控制台" : "管理员登录"}
          </h1>
          <p className="auth-subtitle">
            {isSetup
              ? "设置一个主密码以限制对此 Cloudflare Worker 的访问，或以开放访问模式继续。"
              : "输入主密码以访问 Telegram Clone Worker 控制台。"}
          </p>

          {source === "env" && (
            <div className="auth-env-badge" title="已在 Cloudflare 控制台或 Wrangler 中配置">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
              <span>通过 ADMIN_PASSWORD 强制启用</span>
            </div>
          )}
        </div>

        {error && (
          <div className="auth-error-banner" role="alert">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label className="form-label" htmlFor="auth-password">
              {isSetup ? "新的主密码" : "管理员密码"}
            </label>
            <div className="auth-input-wrapper">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                className="input auth-input"
                placeholder={isSetup ? "至少输入 4 个字符" : "请输入密码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                title={showPassword ? "隐藏密码" : "显示密码"}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {isSetup && (
            <div className="field">
              <label className="form-label" htmlFor="auth-confirm-password">
                确认主密码
              </label>
              <input
                id="auth-confirm-password"
                type={showPassword ? "text" : "password"}
                className="input auth-input"
                placeholder="再次输入主密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          )}

          <div className="auth-actions">
            <button
              type="submit"
              className="btn btn-primary auth-btn-submit"
              disabled={submitting}
            >
              {submitting ? (
                <span>验证中…</span>
              ) : isSetup ? (
                <span>保存密码并进入</span>
              ) : (
                <span>解锁控制台</span>
              )}
            </button>

            {isSetup && (
              <button
                type="button"
                className="btn btn-secondary auth-btn-skip"
                onClick={onCancel ? onCancel : skipSetup}
                disabled={submitting}
              >
                {onCancel ? "取消" : "暂时跳过——不设置密码直接进入"}
              </button>
            )}
          </div>
        </form>

        {isSetup && !onCancel && (
          <p className="auth-footnote">
            提示：你随时可以在控制台导航中，或通过 Cloudflare 控制台设置或修改密码。
          </p>
        )}
      </div>
    </div>
  );
}
