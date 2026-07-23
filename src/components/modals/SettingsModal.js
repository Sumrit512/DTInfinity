"use client";

import React from "react";

export default function SettingsModal({
  showSettings,
  setShowSettings,
  dtInfinityAddress,
  setDtInfinityAddress,
  usdtAddress,
  setUsdtAddress,
  targetChainId,
  setTargetChainId,
  deploymentBlock,
  setDeploymentBlock,
  handleSaveConfig,
  handleResetCache
}) {
  if (!showSettings) return null;

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
          <h3 style={{ fontSize: "18px", fontWeight: "700", margin: 0 }}>Smart Contract Settings</h3>
          <button onClick={() => setShowSettings(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>DTInfinity Contract Address</label>
            <input
              type="text"
              value={dtInfinityAddress}
              onChange={(e) => setDtInfinityAddress(e.target.value)}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", color: "var(--text)", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>USDT Token Address</label>
            <input
              type="text"
              value={usdtAddress}
              onChange={(e) => setUsdtAddress(e.target.value)}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", color: "var(--text)", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Target EVM Network</label>
            <select
              value={targetChainId.toString()}
              onChange={(e) => setTargetChainId(BigInt(e.target.value))}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", color: "var(--text)", fontSize: "13px" }}
            >
              <option value="97">BSC Testnet (Chain ID 97)</option>
              <option value="56">BSC Mainnet (Chain ID 56)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Deployment Block Number</label>
            <input
              type="text"
              value={deploymentBlock}
              onChange={(e) => setDeploymentBlock(e.target.value)}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", color: "var(--text)", fontSize: "13px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button
              className="connect-btn display"
              style={{ flex: 1 }}
              onClick={() => {
                handleSaveConfig();
                setShowSettings(false);
              }}
            >
              Save Configuration
            </button>

            <button
              className="copy-btn"
              style={{ background: "transparent", color: "var(--down)", border: "1px solid var(--down)", padding: "10px 14px" }}
              onClick={handleResetCache}
            >
              Clear Cache
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
