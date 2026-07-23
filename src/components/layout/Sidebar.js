"use client";

import React from "react";

export default function Sidebar({ activeView, setActiveView, sidebarOpen, setSidebarOpen }) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "deposit", label: "Deposit USDT", icon: "💳" },
    { id: "withdraw", label: "Claim Rewards", icon: "💰" },
    { id: "network", label: "Team Network", icon: "🌳" },
    { id: "reports", label: "Reports & Logs", icon: "📑" },
  ];

  return (
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="sidebar-brand" style={{ padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "32px", objectFit: "contain" }} />
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px" }}
          >
            ✕
          </button>
        )}
      </div>

      <nav className="sidebar-nav" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "0 12px" }}>
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? "active" : ""}`}
            onClick={() => {
              setActiveView(item.id);
              if (sidebarOpen) setSidebarOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "12px",
              background: activeView === item.id ? "rgba(94, 200, 242, 0.12)" : "transparent",
              color: activeView === item.id ? "var(--blue-bright)" : "var(--text-muted)",
              border: activeView === item.id ? "1px solid var(--border)" : "1px solid transparent",
              fontWeight: activeView === item.id ? "600" : "400",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "all 0.2s ease"
            }}
          >
            <span style={{ fontSize: "16px" }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
