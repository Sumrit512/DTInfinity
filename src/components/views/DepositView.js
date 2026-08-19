"use client";

import React from "react";

export default function DepositView({
  depositAmount,
  setDepositAmount,
  sponsorAddress,
  setSponsorAddress,
  isRegistered,
  walletAddress,
  walletUSDTBalance,
  handleDeposit,
  handleMintUSDT,
  loading
}) {
  return (
    <div className="view active">
      <div className="card" style={{ maxWidth: "560px", margin: "0 auto", padding: "32px", borderRadius: "16px" }}>
        <div style={{ marginBottom: "26px" }}>
          <h3 className="section-title display" style={{ marginTop: 0, marginBottom: "8px", fontSize: "24px", fontWeight: "800" }}>
            {isRegistered ? "Upgrade Deposit Package" : "Activate Node Deposit"}
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
            {isRegistered
              ? "Increase your active stake to boost your 220% ROI cap and unlock higher network limits."
              : "Submit initial deposit of min 10 USDT to register your node under your sponsor referrer."}
          </p>
        </div>

        <form onSubmit={handleDeposit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {!isRegistered && (
            <div className="field">
              <label style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "8px", fontWeight: "700", letterSpacing: "0.5px" }}>
                Sponsor / Referrer Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={sponsorAddress}
                onChange={(e) => setSponsorAddress(e.target.value)}
                required
                style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px 16px", color: "var(--text)", fontSize: "14.5px" }}
              />
            </div>
          )}

          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "4px" }}>
              <label style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "700", letterSpacing: "0.5px" }}>
                Deposit Amount (USDT)
              </label>
              <span className="mono" style={{ fontSize: "12px", color: "var(--blue-bright)", fontWeight: "600" }}>
                Wallet Balance: {walletUSDTBalance} USDT
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                placeholder="10"
                min="10"
                step="any"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                required
                style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px 16px", paddingRight: "60px", color: "var(--text)", fontSize: "16px" }}
              />
              <span style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "var(--text-muted)", fontWeight: "700" }}>
                USDT
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            {["10", "50", "100", "500", "1000"].map((preset) => {
              const isActive = depositAmount === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={isActive ? "preset-btn active" : "preset-btn"}
                  onClick={() => setDepositAmount(preset)}
                  style={{
                    flex: 1,
                    background: isActive ? "var(--blue-wash)" : "var(--surface-2)",
                    border: isActive ? "1px solid var(--blue-bright)" : "1px solid var(--border)",
                    color: isActive ? "var(--blue-bright)" : "var(--text-muted)",
                    padding: "12px 8px",
                    borderRadius: "10px",
                    fontWeight: "700",
                    fontSize: "14.5px",
                    transition: "all 0.2s ease",
                    cursor: "pointer"
                  }}
                >
                  {preset}
                </button>
              );
            })}
          </div>

          <button
            className="connect-btn display"
            type="submit"
            disabled={loading}
            style={{
              marginTop: "20px",
              padding: "16px",
              fontSize: "16px",
              fontWeight: "800",
              width: "100%",
              borderRadius: "12px",
              cursor: "pointer"
            }}
          >
            {loading ? "Processing Deposit..." : "Approve & Deposit USDT"}
          </button>
        </form>
      </div>
    </div>
  );
}
