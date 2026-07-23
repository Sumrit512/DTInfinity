"use client";

import React from "react";
import { shorten } from "../../utils/formatters.js";

export default function Navbar({
  walletConnected,
  walletAddress,
  networkName,
  isWrongNetwork,
  targetChainId,
  loading,
  connectWallet,
  disconnectWallet,
  switchNetwork,
  setSidebarOpen,
  setShowSettings,
  setShowMissedTxModal,
  isRegistered
}) {
  return (
    <header className="header">
      <div className="header-left" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {isRegistered && (
          <button
            className="mobile-hamburger-btn"
            onClick={() => setSidebarOpen(prev => !prev)}
            style={{
              display: "none", // Managed by CSS media queries
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "8px",
              borderRadius: "8px",
              cursor: "pointer"
            }}
            aria-label="Toggle navigation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        )}

        <div className="brand" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "38px", objectFit: "contain" }} />
        </div>
      </div>

      <div className="header-actions">
        {walletConnected ? (
          <>
            {isWrongNetwork ? (
              <button
                className="copy-btn"
                style={{ background: "var(--down)", color: "#fff", border: "none", fontWeight: "600" }}
                onClick={switchNetwork}
                disabled={loading}
              >
                {loading ? "Switching..." : `Wrong Network (Switch to ${targetChainId === 97n ? "BSC Testnet" : "BSC Mainnet"})`}
              </button>
            ) : (
              <div className="status-badge live" style={{ background: "rgba(94, 200, 242, 0.08)", border: "1px solid var(--border)" }}>
                <span className="dot" style={{ background: "var(--blue-bright)" }}></span>
                <span>{networkName}</span>
              </div>
            )}

            <div className="user-profile-badge mono" style={{ padding: "8px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "13px", fontWeight: "500" }}>
              {shorten(walletAddress)}
            </div>

            <button
              className="disconnect-btn-navbar"
              onClick={disconnectWallet}
              style={{
                padding: "8px 14px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer"
              }}
              title="Disconnect Web3 Wallet"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button className="connect-btn display" onClick={connectWallet} disabled={loading}>
            {loading ? "Connecting..." : "Connect Wallet"}
          </button>
        )}

        <button
          className="settings-icon-btn"
          title="Manual Missed Tx Sync"
          onClick={() => setShowMissedTxModal(true)}
          style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "8px 12px", borderRadius: "10px", color: "var(--text-muted)", cursor: "pointer" }}
        >
          🔍 Sync Tx
        </button>
      </div>
    </header>
  );
}
