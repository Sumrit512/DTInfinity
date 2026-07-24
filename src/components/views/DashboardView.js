"use client";

import React from "react";
import { formatCountdown, shorten } from "../../utils/formatters.js";

export default function DashboardView({
  userData,
  pendingBalances,
  pendingQualifications,
  networkCapPercent,
  roiCapPercent,
  maxRoiCap,
  maxNetworkCap,
  totalAvailableBalance,
  totalEarnedAcrossStreams,
  statsToDisplay,
  origin,
  walletAddress,
  copyText,
  copyReferralLink,
  handleClaimPerformance,
  handleClaimAll,
  loading,
  setActiveView,
  perfOneDay,
  lifetimeTeamVol
}) {
  const [nowUnix, setNowUnix] = React.useState(Math.floor(Date.now() / 1000));

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const validQualifications = (pendingQualifications || []).filter(qual => !qual.isCappedAtStart);

  return (
    <div className="view active">
      {validQualifications.length > 0 && (
        <div className="card" style={{
          background: "rgba(94, 200, 242, 0.06)",
          border: "2px dashed var(--blue-bright)",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "15px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ background: "rgba(94, 200, 242, 0.2)", borderRadius: "50%", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" strokeWidth="2.5" strokeLinecap="round" style={{ width: "22px", height: "22px" }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <div>
              <h4 style={{ margin: 0, color: "#fff", fontSize: "15px", fontWeight: "600" }}>Performance Bonus Status</h4>
              <p style={{ margin: "2px 0 0 0", color: "var(--text-muted)", fontSize: "12px" }}>
                Track your eligibility and active claim windows for achieved performance tiers.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {validQualifications.map((qual) => {
              const claimDateStr = new Date(qual.claimTime * 1000).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              const claimTimeNum = Number(qual.claimTime);
              const endClaimTime = claimTimeNum + Number(perfOneDay || 86400n);
              const isClaimWindowActive = nowUnix >= claimTimeNum && nowUnix < endClaimTime;
              const timeLeft = Math.max(0, endClaimTime - nowUnix);
              const timeUntilActivation = Math.max(0, claimTimeNum - nowUnix);

              return (
                <div key={qual.tierIndex} style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "15px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>Tier {qual.tierIndex + 1} Bonus</span>
                      <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--text-muted)" }}>Target: {qual.target} USDT</span>
                    </div>
                    <div className="mono" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                      Claim Date: {claimDateStr}
                    </div>
                  </div>

                  {isClaimWindowActive ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ fontSize: "12px", color: "var(--up)", display: "flex", alignItems: "center", gap: "6px", fontWeight: "600" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: "16px", height: "16px" }}>
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        Claim Window Closes In: <span className="mono" style={{ color: "#fff", background: "rgba(16, 185, 129, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>{formatCountdown(timeLeft)}</span>
                      </div>
                      
                      {networkCapPercent >= 100 ? (
                        <div style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid var(--down)",
                          borderRadius: "8px",
                          padding: "10px 12px",
                          color: "var(--down)",
                          fontSize: "12.5px",
                          fontWeight: "500",
                          lineHeight: "1.4"
                        }}>
                          ⚠️ Network Cap Reached (400%)! Please upgrade your deposit package to unlock and claim this Performance Bonus.
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleClaimPerformance(qual.tierIndex, true)}
                            className="btn primary-btn"
                            disabled={loading}
                            style={{
                              padding: "8px 16px",
                              fontSize: "12px",
                              flex: 1,
                              minWidth: "140px",
                              background: "linear-gradient(135deg, var(--blue-bright) 0%, #1e40af 100%)",
                              cursor: "pointer"
                            }}
                          >
                            Option 1: Instant Payout ({qual.instant} USDT)
                          </button>
                          <button
                            onClick={() => handleClaimPerformance(qual.tierIndex, false)}
                            className="btn secondary-btn"
                            disabled={loading}
                            style={{
                              padding: "8px 16px",
                              fontSize: "12px",
                              flex: 1,
                              minWidth: "140px",
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text)",
                              cursor: "pointer"
                            }}
                          >
                            Option 2: Daily Payout ({qual.daily} USDT x 30 Days)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "16px", height: "16px" }}>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      {timeUntilActivation > 0 ? (
                        <span>Claim Window Opens In: <span className="mono" style={{ color: "var(--blue-bright)", fontWeight: "600" }}>{formatCountdown(timeUntilActivation)}</span></span>
                      ) : (
                        qual.isCappedAtStart ? (
                          <span style={{ color: "var(--down)", fontWeight: "600" }}>⚠️ Claim Window Expired — Forfeited due to 400% capping at qualification time</span>
                        ) : (
                          <span style={{ color: "var(--up)", fontWeight: "600" }}>✓ Claim Window Expired — Defaulted to Option 2: Daily Payout ({qual.daily} USDT/day x 30 Days)</span>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TOP STATS CARDS */}
      <div className="grid-3">
        <div className="stat-card" style={{ background: "linear-gradient(135deg, rgba(243, 186, 47, 0.08) 0%, rgba(20, 30, 45, 0.4) 100%)", border: "1px solid var(--border)" }}>
          <div className="stat-label">Claimable Balance</div>
          <div className="stat-val display" style={{ color: "var(--blue-bright)" }}>
            {totalAvailableBalance} <span className="unit">USDT</span>
          </div>
          <div style={{ marginTop: "15px" }}>
            <button
              onClick={handleClaimAll}
              disabled={loading || parseFloat(totalAvailableBalance) <= 0}
              className="connect-btn display"
              style={{ width: "100%", padding: "10px", fontSize: "13px" }}
            >
              {loading ? "Claiming..." : "Withdraw All Rewards"}
            </button>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Earned</div>
          <div className="stat-val display" style={{ color: "#fff" }}>
            {totalEarnedAcrossStreams} <span className="unit">USDT</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Deposit Package</div>
          <div className="stat-val display" style={{ color: "var(--text)" }}>
            {userData.totalDeposits} <span className="unit">USDT</span>
          </div>
          <div className="stat-desc">Booster Rate: <strong style={{ color: "var(--blue-bright)" }}>{userData.boosterRate}</strong></div>
          <div style={{ marginTop: "15px" }}>
            <button
              onClick={() => setActiveView("deposit")}
              className="preset-btn"
              style={{ width: "100%", padding: "8px", fontSize: "12px" }}
            >
              + Upgrade Package
            </button>
          </div>
        </div>
      </div>

      {/* INCOME STREAMS BREAKDOWN */}
      <div style={{ marginTop: "24px", marginBottom: "24px" }}>
        <h3 className="section-title">Income details</h3>
        <div className="income-grid">
          <div className="income-card">
            <div className="icon">📈</div>
            <div className="name">Daily & Booster ROI</div>
            <div className="amt" style={{ color: "var(--blue-bright)" }}>{statsToDisplay.totalROI} <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>USDT</span></div>
            <div className="sub">Base 0.5% + Booster rate (Daily: {statsToDisplay.dailyROI} | Booster: {statsToDisplay.boosterROI})</div>
          </div>

          <div className="income-card">
            <div className="icon">🤝</div>
            <div className="name">Level Income</div>
            <div className="amt" style={{ color: "var(--up)" }}>{statsToDisplay.levelIncome} <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>USDT</span></div>
            <div className="sub">5 Levels direct deposit bonus</div>
          </div>

          <div className="income-card">
            <div className="icon">🔄</div>
            <div className="name">Level ROI</div>
            <div className="amt" style={{ color: "#60a5fa" }}>{statsToDisplay.levelROI} <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>USDT</span></div>
            <div className="sub">20 Levels matching ROI yield</div>
          </div>

          <div className="income-card">
            <div className="icon">🏆</div>
            <div className="name">Performance Bonus</div>
            <div className="amt" style={{ color: "var(--blue-bright)" }}>{statsToDisplay.performance} <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>USDT</span></div>
            <div className="sub">Monthly team volume targets</div>
          </div>
        </div>
      </div>

      {/* TEAM NETWORK BUSINESS BREAKDOWN */}
      <div style={{ marginTop: "24px", marginBottom: "24px" }}>
        <h3 className="section-title">Team Network Business Breakdown</h3>
        <div className="grid-2">
          <div className="card" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="stat-label" style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
                  Lifetime Team Business
                </div>
                <div className="stat-val display" style={{ fontSize: "32px", fontWeight: "800", color: "#fff", marginTop: "6px" }}>
                  {lifetimeTeamVol} <span className="unit" style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
                </div>
              </div>
              <div style={{ fontSize: "26px", background: "var(--blue-wash)", padding: "12px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>📈</div>
            </div>
            <div className="stat-desc" style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--text-muted)" }}>
              All-time cumulative deposit volume generated across all downline generations
            </div>
          </div>

          <div className="card" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="stat-label" style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
                  Current Month Business
                </div>
                <div className="stat-val display" style={{ fontSize: "32px", fontWeight: "800", color: "var(--blue-bright)", marginTop: "6px" }}>
                  {parseFloat(userData.totalTeamVolume || "0").toFixed(2)} <span className="unit" style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
                </div>
              </div>
              <div style={{ fontSize: "26px", background: "rgba(243, 186, 47, 0.1)", padding: "12px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>📅</div>
            </div>
            <div className="stat-desc" style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--text-muted)" }}>
              Active volume for current calendar month (resets on the 1st of every month)
            </div>
          </div>

          <div className="card" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="stat-label" style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
                  Stronger Leg Volume
                </div>
                <div className="stat-val display" style={{ fontSize: "32px", fontWeight: "800", color: "var(--blue-bright)", marginTop: "6px" }}>
                  {parseFloat(userData.strongestLegVolume || "0").toFixed(2)} <span className="unit" style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
                </div>
              </div>
              <div style={{ fontSize: "26px", background: "var(--blue-wash)", padding: "12px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>⚡</div>
            </div>
            <div className="stat-desc" style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--text-muted)" }}>
              Volume from your single highest performing direct leg ({shorten(userData.strongestLegAddress || "")})
            </div>
          </div>

          <div className="card" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="stat-label" style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>
                  Weaker / Other Legs Volume
                </div>
                <div className="stat-val display" style={{ fontSize: "32px", fontWeight: "800", color: "var(--up)", marginTop: "6px" }}>
                  {Math.max(0, parseFloat(userData.totalTeamVolume || "0") - parseFloat(userData.strongestLegVolume || "0")).toFixed(2)} <span className="unit" style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
                </div>
              </div>
              <div style={{ fontSize: "26px", background: "rgba(16, 185, 129, 0.1)", padding: "12px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>🌐</div>
            </div>
            <div className="stat-desc" style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--text-muted)" }}>
              Combined volume from all remaining direct downline legs
            </div>
          </div>
        </div>
      </div>

      {/* NETWORK & ROI CAPPING METRICS */}
      <div className="grid-2" style={{ marginTop: "20px" }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Daily ROI & Booster Capping (220%)</h3>
              <p className="card-subtitle">Maximum yield threshold for personal deposits</p>
            </div>
            <div className="mono" style={{ fontSize: "13px", fontWeight: "600", color: "var(--blue-bright)" }}>
              {roiCapPercent.toFixed(1)}%
            </div>
          </div>
          <div className="cap-bar-track" style={{ height: "10px", background: "var(--surface-2)", borderRadius: "5px", overflow: "hidden", margin: "15px 0" }}>
            <div className="cap-bar-fill" style={{ width: `${roiCapPercent}%`, height: "100%", background: "var(--blue-bright)", transition: "width 0.4s ease" }}></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)" }}>
            <span>Earned: {statsToDisplay.totalROI} USDT</span>
            <span>Max Cap: {maxRoiCap.toFixed(2)} USDT</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Network Earnings Capping (400%)</h3>
              <p className="card-subtitle">Level Income, Matching & Performance Limit</p>
            </div>
            <div className="mono" style={{ fontSize: "13px", fontWeight: "600", color: "var(--blue-bright)" }}>
              {networkCapPercent.toFixed(1)}%
            </div>
          </div>
          <div className="cap-bar-track" style={{ height: "10px", background: "var(--surface-2)", borderRadius: "5px", overflow: "hidden", margin: "15px 0" }}>
            <div className="cap-bar-fill" style={{ width: `${networkCapPercent}%`, height: "100%", background: "linear-gradient(90deg, var(--blue-bright), var(--up))", transition: "width 0.4s ease" }}></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)" }}>
            <span>Total Network Earned: {totalEarnedAcrossStreams} USDT</span>
            <span>Max Cap: {maxNetworkCap.toFixed(2)} USDT</span>
          </div>
        </div>
      </div>

      {/* REFERRAL LINK SHARE SECTION */}
      <div className="card" style={{ marginTop: "20px" }}>
        <h3 className="card-title">Your Referral Invitation Link</h3>
        <p className="card-subtitle">Share your unique link to invite partners and earn up to 5 levels of Level Income & matching ROI.</p>
        <div style={{ display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" }}>
          <input
            type="text"
            readOnly
            value={`${origin}/?ref=${walletAddress}`}
            style={{ flex: 1, minWidth: "260px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 14px", color: "var(--text-muted)", fontSize: "13px" }}
          />
          <button className="connect-btn display" onClick={copyReferralLink} style={{ padding: "10px 20px" }}>
            {copyText}
          </button>
        </div>
      </div>
    </div>
  );
}
