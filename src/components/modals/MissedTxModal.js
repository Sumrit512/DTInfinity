"use client";

import React from "react";

export default function MissedTxModal({
  showMissedTxModal,
  setShowMissedTxModal,
  missedTxHash,
  setMissedTxHash,
  syncingMissed,
  handleSyncMissedTx
}) {
  if (!showMissedTxModal) return null;

  return (
    <div className="modal-backdrop" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(5, 7, 10, 0.8)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: "20px"
    }}>
      <div className="modal-card" style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "16px", padding: "24px", maxWidth: "480px", width: "100%",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "700", margin: 0 }}>Sync Missed On-Chain Transaction</h3>
          <button onClick={() => setShowMissedTxModal(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>

        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
          If a transaction succeeded on the blockchain but did not appear in your Convex DB history, enter the transaction hash below to manually recover and record it.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Transaction Hash (0x...)</label>
            <input
              type="text"
              placeholder="0x..."
              value={missedTxHash}
              onChange={(e) => setMissedTxHash(e.target.value)}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", color: "var(--text)", fontSize: "13px" }}
            />
          </div>

          <button
            className="connect-btn display"
            onClick={async () => {
              await handleSyncMissedTx();
              setShowMissedTxModal(false);
            }}
            disabled={syncingMissed}
          >
            {syncingMissed ? "Recovering Transaction..." : "Sync Transaction"}
          </button>
        </div>
      </div>
    </div>
  );
}
