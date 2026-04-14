import { useDeferredValue, useMemo } from "react";
import { currentTool } from "../config/tool";
import { signInWithGitHub, signOutUser } from "../features/auth/authClient";
import { useAuthState } from "../features/auth/useAuthState";
import { useToolState } from "../features/tool-state/useToolState";
import { PREVIOUS_PATTERN_OPTIONS, RISK_PROFILE_OPTIONS, SLOT_LABELS } from "../features/turnips/constants";
import { calculateTurnipDecision, type DecisionInput } from "../features/turnips/decisionEngine";

function parseNumericInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function createDecisionInput(state: ReturnType<typeof useToolState>["state"]): DecisionInput {
  return {
    buyPrice: parseNumericInput(state.buyPrice),
    previousPattern: state.previousPattern,
    riskProfile: state.riskProfile,
    observations: state.observedPrices.map((value) => parseNumericInput(value)),
  };
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatBell(value: number) {
  return `${Math.round(value * 10) / 10}ベル`;
}

export function App() {
  const { user, loading: authLoading, authEnabled } = useAuthState();
  const {
    state,
    loading,
    saving,
    error,
    setBuyPrice,
    setPreviousPattern,
    setRiskProfile,
    setObservedPrice,
    save,
    syncLocalToCloud,
    hasLocalData,
    lastSavedLabel,
    reset,
  } = useToolState(user, authEnabled);
  const deferredState = useDeferredValue(state);
  const analysis = useMemo(() => calculateTurnipDecision(createDecisionInput(deferredState)), [deferredState]);

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero__copy">
          <p className="eyebrow">TURNIP TIMING</p>
          <h1>{currentTool.name}</h1>
          <p className="hero__body">{currentTool.description}</p>
          <p className="hero__caption">先週の型、日曜の買値、今週ここまでの価格だけで売却判断を出します。</p>
        </div>

        <div className="hero__panel">
          <div className="status-grid">
            <StatusBlock label="保存先" value={user ? "Cloud" : "Local"} />
            <StatusBlock label="状態" value={saving ? "保存中" : loading ? "読込中" : "計算待機"} />
            <StatusBlock label="最終保存" value={lastSavedLabel} />
          </div>

          <div className="auth-box">
            {authLoading ? (
              <p className="muted inverse">認証状態を確認中です。</p>
            ) : user ? (
              <>
                <p className="auth-box__title">{user.displayName ?? user.email ?? "ログイン済み"}</p>
                <p className="muted inverse">GitHub アカウントで同期できます。</p>
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
                <p className="muted inverse">端末をまたいで使うときだけ GitHub ログインをご利用ください。</p>
                <button className="primary-button" onClick={signInWithGitHub} disabled={!authEnabled}>
                  GitHub でログイン
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>入力</h2>
              <p className="muted">空欄は未観測として扱います。分かる枠だけ入力してください。</p>
            </div>

            <div className="button-row">
              <button className="ghost-button" onClick={reset} disabled={saving}>
                リセット
              </button>
              <button className="primary-button" onClick={save} disabled={saving || loading}>
                保存
              </button>
            </div>
          </div>

          <div className="controls">
            <label className="field">
              <span>先週のパターン</span>
              <select value={state.previousPattern} onChange={(event) => setPreviousPattern(event.target.value as typeof state.previousPattern)}>
                {PREVIOUS_PATTERN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>日曜の購入価格</span>
              <input
                inputMode="numeric"
                placeholder="90-110"
                value={state.buyPrice}
                onChange={(event) => setBuyPrice(event.target.value.replace(/[^\d]/g, ""))}
              />
            </label>

            <label className="field">
              <span>判断スタイル</span>
              <select value={state.riskProfile} onChange={(event) => setRiskProfile(event.target.value as typeof state.riskProfile)}>
                {RISK_PROFILE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="price-grid">
            {SLOT_LABELS.map((label, index) => (
              <label key={label} className="price-cell">
                <span>{label}</span>
                <input
                  inputMode="numeric"
                  placeholder="未入力"
                  value={state.observedPrices[index]}
                  onChange={(event) => setObservedPrice(index, event.target.value.replace(/[^\d]/g, ""))}
                />
              </label>
            ))}
          </div>

          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <h2>判定</h2>
              <p className="muted">継続価値は、ここから先も最適に売る前提の期待値です。</p>
            </div>
          </div>

          {analysis.status === "ok" ? (
            <>
              <div className={`decision-banner decision-banner--${analysis.recommendation}`}>
                <div>
                  <p className="decision-banner__eyebrow">現在: {analysis.currentSlotLabel}</p>
                  <strong>{analysis.recommendation === "sell" ? "今売る" : "待つ"}</strong>
                </div>
                <div className="decision-banner__metrics">
                  <MetricCard label="現在価格" value={formatBell(analysis.currentPrice)} />
                  <MetricCard label="継続価値" value={formatBell(analysis.continuationValue)} />
                  <MetricCard label="判定閾値" value={formatBell(analysis.adjustedContinuationValue)} />
                </div>
              </div>

              <div className="metrics-grid">
                <MetricCard label="Sell Now Score" value={formatBell(analysis.sellNowScore)} />
                <MetricCard label="今より良い判断に到達する確率" value={formatPercent(analysis.betterProbability)} />
                <MetricCard label="事後粒子数" value={analysis.posteriorParticleCount.toLocaleString("ja-JP")} />
              </div>

              <div className="analysis-grid">
                <div className="subpanel">
                  <h3>待った場合の価値帯</h3>
                  {analysis.futureValueBands ? (
                    <div className="band-grid">
                      <MetricCard label="下位帯" value={formatBell(analysis.futureValueBands.low)} />
                      <MetricCard label="中央値" value={formatBell(analysis.futureValueBands.median)} />
                      <MetricCard label="上位帯" value={formatBell(analysis.futureValueBands.high)} />
                    </div>
                  ) : (
                    <p className="muted">これ以降の売却機会はありません。</p>
                  )}
                </div>

                <div className="subpanel">
                  <h3>パターン事後確率</h3>
                  <div className="pattern-list">
                    {analysis.patternProbabilities.map((pattern) => (
                      <div key={pattern.pattern} className="pattern-row">
                        <div className="pattern-row__label">
                          <span>{pattern.label}</span>
                          <strong>{formatPercent(pattern.probability)}</strong>
                        </div>
                        <div className="pattern-row__bar">
                          <div style={{ width: `${pattern.probability * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="analysis-message">{analysis.message}</p>
          )}
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

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
