import { currentTool } from "../config/tool";
import { signInWithGitHub, signOutUser } from "../features/auth/authClient";
import { useAuthState } from "../features/auth/useAuthState";
import { useToolState } from "../features/tool-state/useToolState";

export function App() {
  const { user, loading: authLoading, authEnabled } = useAuthState();
  const {
    state,
    loading,
    saving,
    error,
    setDraft,
    save,
    syncLocalToCloud,
    hasLocalData,
    lastSavedLabel,
    reset,
  } = useToolState(user, authEnabled);

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero__copy">
          <p className="eyebrow">TOOL TEMPLATE</p>
          <h1>{currentTool.name}</h1>
          <p className="hero__body">{currentTool.description}</p>
          {currentTool.configIssues.length > 0 ? (
            <p className="template-warning">{currentTool.configIssues.join(" ")}</p>
          ) : null}
        </div>

        <div className="hero__panel">
          <div className="status-grid">
            <StatusBlock label="保存先" value={user ? "Cloud" : "Local"} />
            <StatusBlock label="状態" value={saving ? "保存中" : "準備完了"} />
            <StatusBlock label="最終保存" value={lastSavedLabel} />
          </div>

          <div className="auth-box">
            {authLoading ? (
              <p className="muted">認証状態を確認中です。</p>
            ) : user ? (
              <>
                <p className="auth-box__title">{user.displayName ?? user.email ?? "ログイン済み"}</p>
                <p className="muted">GitHub アカウントで同期できます。</p>
                <div className="button-row">
                  <button className="secondary-button" onClick={syncLocalToCloud} disabled={!hasLocalData || saving}>
                    ローカル内容を同期
                  </button>
                  <button className="secondary-button" onClick={signOutUser}>
                    ログアウト
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="auth-box__title">未ログインでも使えます。</p>
                <p className="muted">別端末でも使いたいときだけ GitHub でログインしてください。</p>
                <button className="primary-button" onClick={signInWithGitHub} disabled={!authEnabled}>
                  GitHub でログイン
                </button>
                {!authEnabled ? <p className="notice">Firebase 設定未投入のため認証は無効です。</p> : null}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <h2>ツール本体</h2>
          <p className="muted">この領域を各ツールの UI に置き換えてください。</p>

          <div className="tool-form">
            <textarea
              value={state.draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="ここを各ツールの入力欄や計算 UI に置き換えます。"
            />

            <div className="tool-form__footer">
              <p className="muted">文字数: {state.draft.length}</p>

              <div className="button-row">
                <button className="ghost-button" onClick={reset} disabled={saving}>
                  リセット
                </button>
                <button className="primary-button" onClick={save} disabled={saving || loading}>
                  保存
                </button>
              </div>
            </div>

            {error ? <p className="error">{error}</p> : null}
          </div>
        </section>

        <section className="panel">
          <h2>このテンプレートで置き換える項目</h2>
          <div className="meta-list">
            <div className="meta-row">
              <span className="muted">ツール ID</span>
              <strong>{currentTool.id}</strong>
            </div>
            <div className="meta-row">
              <span className="muted">リポジトリ</span>
              <strong>{currentTool.fullRepo}</strong>
            </div>
            <div className="meta-row">
              <span className="muted">タグ</span>
              <strong>{currentTool.tags.join(", ")}</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusBlock(props: { label: string; value: string }) {
  return (
    <div className="status-block">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
