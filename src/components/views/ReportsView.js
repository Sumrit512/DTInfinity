"use client";

import React from "react";
import { formatTxAmount, shorten } from "../../utils/formatters.js";

export default function ReportsView({
  filteredTxs,
  paginatedTxs,
  totalSelectedIncome,
  filterType,
  setFilterType,
  filterLevel,
  setFilterLevel,
  searchLevel,
  setSearchLevel,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  searchFromUser,
  setSearchFromUser,
  sortOrder = "asc",
  setSortOrder,
  currentPage,
  setCurrentPage,
  totalPages,
  itemsPerPage,
  todayStr,
  handleExportCSV,
  handleExportJSON
}) {
  return (
    <div className="view active">
      <div className="card reports-card" style={{ padding: "26px" }}>
        <div className="history-header-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
          <div>
            <h3 className="section-title" style={{ marginTop: 0, marginBottom: "4px" }}>Income Audits & Earnings Log</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
              Detailed historical ledger of all yields, bonuses, deposits, and withdrawals.
            </p>
          </div>

          <div className="reports-top-actions" style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
            <div className="history-total-income">
              <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}>Filtered Income</div>
              <div className="mono" style={{ fontSize: "24px", fontWeight: "800", color: "var(--blue-bright)" }}>
                {totalSelectedIncome.toFixed(2)} <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button className="copy-btn" onClick={handleExportCSV} style={{ padding: "10px 16px", fontSize: "13px", background: "var(--surface-2)" }}>
                📥 CSV
              </button>
              <button className="copy-btn" onClick={handleExportJSON} style={{ padding: "10px 16px", fontSize: "13px", background: "var(--surface-2)" }}>
                📥 JSON
              </button>
            </div>
          </div>
        </div>

        {/* Filter controls */}
        <div className="reports-filters-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "15px", marginBottom: "18px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px", fontWeight: "700" }}>Sort Order</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder && setSortOrder(e.target.value)}
              className="filter-input"
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 14px", color: "var(--text)", fontSize: "14.5px" }}
            >
              <option value="asc">Chronological (Oldest First)</option>
              <option value="desc">Latest First (Newest First)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px", fontWeight: "700" }}>Type of Income</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-input"
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 14px", color: "var(--text)", fontSize: "14.5px" }}
            >
              <option value="all">All Types</option>
              <option value="deposit">Deposit</option>
              <option value="withdraw">Withdrawal</option>
              <option value="roi">Daily ROI Payout</option>
              <option value="level_income">Level Income</option>
              <option value="level_roi">Level ROI Matching</option>
              <option value="performance">Performance Bonus</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px", fontWeight: "700" }}>Level (Dropdown)</label>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="filter-input"
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 14px", color: "var(--text)", fontSize: "14.5px" }}
            >
              <option value="all">All Levels</option>
              {Array.from({ length: 20 }, (_, idx) => (
                <option key={idx + 1} value={(idx + 1).toString()}>Level {idx + 1}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px", fontWeight: "700" }}>Search by Level</label>
            <input
              type="text"
              placeholder="e.g. 5"
              value={searchLevel}
              onChange={(e) => setSearchLevel(e.target.value)}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 14px", color: "var(--text)", fontSize: "14.5px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px", fontWeight: "700" }}>Start Date</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              max={todayStr}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 14px", color: "var(--text)", fontSize: "14.5px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px", fontWeight: "700" }}>End Date</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              max={todayStr}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 14px", color: "var(--text)", fontSize: "14.5px" }}
            />
          </div>
        </div>

        <div className="reports-search-row" style={{ display: "flex", gap: "15px", alignItems: "center", marginBottom: "22px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "220px" }}>
            <input
              type="text"
              placeholder="Search wallet address..."
              value={searchFromUser}
              onChange={(e) => setSearchFromUser(e.target.value)}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 16px", color: "var(--text)", fontSize: "14.5px" }}
            />
          </div>
          <button
            onClick={() => {
              setFilterType("all");
              setFilterLevel("all");
              setSearchLevel("");
              setFilterStartDate("");
              setFilterEndDate("");
              setSearchFromUser("");
            }}
            className="copy-btn reports-reset-btn"
            style={{ padding: "12px 20px", fontSize: "13px", background: "transparent", border: "1px solid var(--border)" }}
          >
            Reset Filters
          </button>
        </div>

        {/* Table */}
        <div className="reports-table-container">
          {filteredTxs.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "30px 0", textAlign: "center" }}>
              No matching transaction logs found for the selected filters.
            </div>
          ) : (
            <table className="reports-table" style={{ width: "100%", minWidth: "850px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>S.No.</th>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>From User</th>
                  <th style={{ textAlign: "right", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Amount</th>
                  <th style={{ textAlign: "center", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Level</th>
                  <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Date & Time</th>
                  <th style={{ textAlign: "center", padding: "12px 10px", fontSize: "12px", color: "var(--text-muted)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTxs.map((tx, idx) => {
                  const dateStr = new Date(tx.timestamp * 1000).toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const isNegative = tx.type === "withdraw";

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px" }}>
                        <span className={
                          tx.type === "deposit" ? "tag roi" :
                            tx.type === "withdraw" ? "tag bonus" :
                              tx.type === "level_income" ? "tag level" :
                                tx.type === "level_roi" ? "tag level" :
                                  tx.type === "roi" ? "tag roi" :
                                    "tag bonus"
                        }>
                          {tx.typeName}
                        </span>
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">
                        {tx.fromUser.length > 10 ? (
                          <span title={tx.fromUser} style={{ cursor: "pointer", borderBottom: "1px dashed var(--text-muted)" }} onClick={() => {
                            navigator.clipboard.writeText(tx.fromUser);
                            alert("Address copied!");
                          }}>
                            {shorten(tx.fromUser)}
                          </span>
                        ) : tx.fromUser}
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "right", fontWeight: "600" }} className={isNegative ? "amt-neg" : "amt-pos"}>
                        {isNegative ? "-" : "+"}{formatTxAmount(tx.amount)} USDT
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "center" }} className="mono">{tx.level}</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">{dateStr}</td>
                      <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "center" }}>
                        <span style={{
                          background: tx.status?.startsWith("Pending") ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)",
                          color: tx.status?.startsWith("Pending") ? "#f59e0b" : "#10b981",
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontWeight: "600"
                        }}>
                          {tx.status || "Completed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {filteredTxs.length > 0 && (
          <div style={{
            display: "flex",
            justify: "space-between",
            alignItems: "center",
            marginTop: "20px",
            flexWrap: "wrap",
            gap: "15px",
            paddingTop: "15px",
            borderTop: "1px solid var(--border)"
          }}>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Showing {Math.min(filteredTxs.length, (currentPage - 1) * itemsPerPage + 1)}–{Math.min(filteredTxs.length, currentPage * itemsPerPage)} of {filteredTxs.length} entries
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="copy-btn"
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  border: "1px solid var(--border)",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  opacity: currentPage === 1 ? 0.5 : 1
                }}
              >
                Previous
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = 1;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else {
                  if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      border: pageNum === currentPage ? "1px solid var(--blue-bright)" : "1px solid var(--border)",
                      background: pageNum === currentPage ? "rgba(94, 200, 242, 0.1)" : "transparent",
                      color: pageNum === currentPage ? "var(--blue-bright)" : "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: pageNum === currentPage ? "600" : "normal"
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="copy-btn"
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  border: "1px solid var(--border)",
                  cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                  opacity: currentPage === totalPages ? 0.5 : 1
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
