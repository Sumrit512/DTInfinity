"use client";

import React from "react";

export default function WithdrawView({
  userData,
  pendingBalances,
  totalAvailableBalance,
  pendingQualifications,
  activeBonuses,
  handleClaimAll,
  handleClaimPerformance,
  loading,
  perfOneDay
}) {
  return (
    <div className="view active">
      <div className="card" style={{ padding: "32px", maxWidth: "680px", margin: "0 auto" }}>
        <h3 className="section-title" style={{ marginTop: 0, marginBottom: "6px" }}>Claim All Accumulated Yields</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "14.5px", marginBottom: "24px" }}>
          Withdraw all your available Daily ROI, Booster Yields, and Network commissions directly into your connected Web3 wallet.
        </p>

        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "14px", padding: "24px", marginBottom: "24px" }}>
          <div style={{ fontSize: "13px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "1px", fontWeight: "700" }}>Total Available Rewards</div>
          <div className="mono display" style={{ fontSize: "38px", color: "var(--blue-bright)", fontWeight: "800" }}>
            {totalAvailableBalance} <span style={{ fontSize: "18px", color: "var(--text-muted)" }}>USDT</span>
          </div>
        </div>

        <button
          onClick={handleClaimAll}
          disabled={loading || parseFloat(totalAvailableBalance) <= 0}
          className="connect-btn display"
          style={{ width: "100%", padding: "16px", fontSize: "16px" }}
        >
          {loading ? "Processing Claim..." : "Claim All Rewards Now"}
        </button>
      </div>
    </div>
  );
}
