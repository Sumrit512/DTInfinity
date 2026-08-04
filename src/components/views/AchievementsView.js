"use client";

import React, { useMemo } from "react";
import { formatTxAmount, shorten } from "../../utils/formatters.js";
import { PERFORMANCE_TIERS } from "../../constants/abis.js";

export default function AchievementsView({
  userData = {},
  activeBonuses = [],
  pendingQualifications = [],
  simulationResult = {},
  lifetimeTeamVol = "0.00",
}) {
  const totalTeamVolNum = parseFloat(userData.totalTeamVolume || lifetimeTeamVol || "0");
  const strongestLegVolNum = parseFloat(userData.strongestLegVolume || "0");
  const weakerLegsVolNum = Math.max(0, totalTeamVolNum - strongestLegVolNum);
  const perfEarnedNum = parseFloat(userData.performanceBonusEarned || "0");

  // Map user's past & active achievements across Tier 1 to Tier 5
  const tierAchievements = useMemo(() => {
    return PERFORMANCE_TIERS.map((tierDef, idx) => {
      const targetVol = tierDef.target;
      const progressPct = Math.min(100, (totalTeamVolNum / targetVol) * 100);

      // Find matching record from activeBonuses
      const recordsForTier = (activeBonuses || []).filter(b => Number(b.tierIndex) === idx);
      const isAchieved = totalTeamVolNum >= targetVol || recordsForTier.length > 0;

      let chosenOption = null;
      let totalPaidForTier = 0;
      let statusText = "Locked";
      let statusBadgeClass = "badge-locked";

      if (recordsForTier.length > 0) {
        // Evaluate the primary record for this tier
        const primaryRec = recordsForTier[0];
        const isInstant = (primaryRec.activationType === 1 || primaryRec.status === 1 || primaryRec.chooseInstant === true);
        chosenOption = isInstant ? "Option A (Instant Reward)" : "Option B (30-Day Salary Stream)";

        totalPaidForTier = recordsForTier.reduce((sum, r) => {
          if (r.activationType === 1 || r.chooseInstant === true) {
            return sum + (r.instantAmount || tierDef.instant);
          }
          return sum + (r.amountPaid !== undefined && r.amountPaid > 0 ? r.amountPaid : (30 * (r.dailyRate || tierDef.daily)));
        }, 0);

        if (isInstant || primaryRec.completed || primaryRec.status === 4) {
          statusText = "Completed";
          statusBadgeClass = "badge-completed";
        } else {
          statusText = "Streaming Active";
          statusBadgeClass = "badge-active";
        }
      } else if (isAchieved) {
        statusText = "Achieved";
        statusBadgeClass = "badge-achieved";
      } else if (progressPct > 0) {
        statusText = "In Progress";
        statusBadgeClass = "badge-progress";
      }

      return {
        tierIndex: idx,
        tierName: tierDef.name || `Tier ${idx + 1}`,
        targetVolume: targetVol,
        instantAmount: tierDef.instant,
        dailyRate: tierDef.daily,
        progressPct,
        isAchieved,
        recordsCount: recordsForTier.length,
        records: recordsForTier,
        chosenOption,
        totalPaidForTier,
        statusText,
        statusBadgeClass
      };
    });
  }, [totalTeamVolNum, activeBonuses]);

  const completedTiersCount = tierAchievements.filter(t => t.isAchieved).length;

  // Build granular historical audit table from simulation ledger & activeBonuses
  const historicalRecords = useMemo(() => {
    const list = [];
    const processedIds = new Set();

    (activeBonuses || []).forEach((b, idx) => {
      const recId = Number(b.recordId || idx + 1);
      if (processedIds.has(recId)) return;
      processedIds.add(recId);

      const tierIdx = Number(b.tierIndex || 0);
      const tierDef = PERFORMANCE_TIERS[tierIdx] || { name: `Tier ${tierIdx + 1}`, target: 5000, instant: 75, daily: 5 };
      const isInstant = (b.activationType === 1 || b.status === 1 || b.chooseInstant === true);
      const startT = Number(b.startTime || b.monthId || b.qualificationTimestamp || 0);
      const endT = Number(b.endTime || (startT + 30 * 480));
      
      let amountPaid = 0;
      if (isInstant) {
        amountPaid = b.instantAmount || tierDef.instant;
      } else {
        amountPaid = b.amountPaid !== undefined && b.amountPaid > 0 ? b.amountPaid : 30 * (b.dailyRate || tierDef.daily);
      }

      list.push({
        recordId: recId,
        tierName: tierDef.name || `Tier ${tierIdx + 1}`,
        tierIndex: tierIdx,
        targetVolume: tierDef.target,
        optionChosen: isInstant ? "Option A (Instant Reward)" : "Option B (30-Day Stream)",
        dailyRate: b.dailyRate || tierDef.daily,
        amountPaid: amountPaid,
        startTime: startT,
        endTime: endT,
        status: (isInstant || b.completed || b.status === 4) ? "Completed" : "Active Payout"
      });
    });

    return list.sort((a, b) => b.startTime - a.startTime);
  }, [activeBonuses]);

  return (
    <div className="view active" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Header Card */}
      <div className="card" style={{ padding: "28px", background: "linear-gradient(135deg, rgba(20,24,36,0.95) 0%, rgba(13,16,24,0.98) 100%)", borderRadius: "18px", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "28px" }}>🏆</span>
              <h2 className="section-title" style={{ margin: 0, fontSize: "24px", fontWeight: "800", color: "#fff" }}>
                Achievements & Performance Milestone Hub
              </h2>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "14.5px", margin: 0, maxWidth: "680px", lineHeight: "1.5" }}>
              Comprehensive breakdown of your total network business volume, leg distribution, and historical performance bonus milestone achievements.
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ padding: "14px 20px", borderRadius: "12px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
              <div style={{ fontSize: "11px", color: "#f59e0b", textTransform: "uppercase", fontWeight: "700", letterSpacing: "1px" }}>Milestones Completed</div>
              <div className="mono" style={{ fontSize: "22px", fontWeight: "800", color: "#f59e0b", marginTop: "2px" }}>
                {completedTiersCount} / 5 <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Tiers</span>
              </div>
            </div>

            <div style={{ padding: "14px 20px", borderRadius: "12px", background: "rgba(94, 200, 242, 0.08)", border: "1px solid rgba(94, 200, 242, 0.25)" }}>
              <div style={{ fontSize: "11px", color: "var(--blue-bright)", textTransform: "uppercase", fontWeight: "700", letterSpacing: "1px" }}>Total Bonus Earned</div>
              <div className="mono" style={{ fontSize: "22px", fontWeight: "800", color: "var(--blue-bright)", marginTop: "2px" }}>
                {perfEarnedNum.toFixed(2)} <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>USDT</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Network Business Overview Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <div className="card" style={{ padding: "22px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "700", letterSpacing: "1px" }}>Lifetime Team Volume</div>
            <span style={{ fontSize: "20px" }}>🌐</span>
          </div>
          <div className="mono" style={{ fontSize: "26px", fontWeight: "800", color: "#fff" }}>
            {totalTeamVolNum.toFixed(2)} <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
            Cumulative turnover generated across all downline levels
          </div>
        </div>

        <div className="card" style={{ padding: "22px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "700", letterSpacing: "1px" }}>Stronger Leg Volume (Max 60%)</div>
            <span style={{ fontSize: "20px" }}>⚡</span>
          </div>
          <div className="mono" style={{ fontSize: "26px", fontWeight: "800", color: "#f59e0b" }}>
            {strongestLegVolNum.toFixed(2)} <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
            {totalTeamVolNum > 0 ? ((strongestLegVolNum / totalTeamVolNum) * 100).toFixed(1) : "0.0"}% of total business volume
          </div>
        </div>

        <div className="card" style={{ padding: "22px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "700", letterSpacing: "1px" }}>Weaker / Other Legs Volume (Min 40%)</div>
            <span style={{ fontSize: "20px" }}>🌱</span>
          </div>
          <div className="mono" style={{ fontSize: "26px", fontWeight: "800", color: "#10b981" }}>
            {weakerLegsVolNum.toFixed(2)} <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
            {totalTeamVolNum > 0 ? ((weakerLegsVolNum / totalTeamVolNum) * 100).toFixed(1) : "0.0"}% of total business volume
          </div>
        </div>
      </div>

      {/* Historical Performance Bonus Achievements Audit Log */}
      <div className="card" style={{ padding: "26px", borderRadius: "16px", border: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ marginBottom: "20px" }}>
          <h3 className="section-title" style={{ marginTop: 0, marginBottom: "4px", fontSize: "18px" }}>
            📜 Past Performance Achievements Log
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13.5px", margin: 0 }}>
            Official record of all claimed performance bonus streams and instant rewards.
          </p>
        </div>

        {historicalRecords.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "13.5px", padding: "30px 0", textAlign: "center" }}>
            No claim historical records logged yet. Complete business milestone targets above to unlock rewards.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "750px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Rec ID</th>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Tier Name</th>
                  <th style={{ textAlign: "right", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Target Vol</th>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Payout Choice</th>
                  <th style={{ textAlign: "right", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Total Amount</th>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Start Date</th>
                  <th style={{ textAlign: "center", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {historicalRecords.map((rec, idx) => {
                  const dateStr = rec.startTime > 0
                    ? new Date(rec.startTime * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : "-";

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">#{rec.recordId}</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", fontWeight: "600", color: "#fff" }}>{rec.tierName}</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "right" }} className="mono">{rec.targetVolume.toLocaleString()} USDT</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px" }}>
                        <span style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: rec.optionChosen.includes("Instant") ? "rgba(94, 200, 242, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          color: rec.optionChosen.includes("Instant") ? "var(--blue-bright)" : "#f59e0b",
                          fontWeight: "600"
                        }}>
                          {rec.optionChosen}
                        </span>
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "right", fontWeight: "700", color: "#10b981" }} className="mono">
                        +{rec.amountPaid.toFixed(2)} USDT
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">{dateStr}</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "center" }}>
                        <span style={{
                          background: rec.status === "Completed" ? "rgba(16, 185, 129, 0.15)" : "rgba(94, 200, 242, 0.15)",
                          color: rec.status === "Completed" ? "#10b981" : "var(--blue-bright)",
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontWeight: "600"
                        }}>
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
