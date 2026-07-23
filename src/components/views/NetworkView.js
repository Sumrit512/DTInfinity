"use client";

import React from "react";
import { ethers } from "ethers";
import { shorten } from "../../utils/formatters.js";

function TreeNodeComponent({ addr, depth = 0, treeNodes, selectedNode, setSelectedNode, loadTreeNode, setLoading }) {
  const normalizedAddr = addr.toLowerCase();
  const node = treeNodes[normalizedAddr];
  const isExpanded = !!node;
  const isSelected = selectedNode?.toLowerCase() === normalizedAddr;

  const handleNodeClick = async (e) => {
    e.stopPropagation();
    setSelectedNode(addr);
    if (!isExpanded && loadTreeNode) {
      setLoading(true);
      await loadTreeNode(addr);
      setLoading(false);
    }
  };

  return (
    <div className="tree-branch-wrapper">
      <div
        className={`tree-node-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : 'collapsed'}`}
        onClick={handleNodeClick}
      >
        <div className="tree-node-icon">
          {depth === 0 ? "👑" : "👤"}
        </div>
        <div className="tree-node-info">
          <div className="tree-node-addr mono">{shorten(addr)}</div>
          {node && (
            <div className="tree-node-meta">
              <span>Pkg: {parseFloat(node.totalDeposits).toFixed(0)}</span> · <span>Vol: {parseFloat(node.totalTeamVolume).toFixed(0)}</span>
            </div>
          )}
          {!node && <div className="tree-node-meta click-to-expand">Click to expand</div>}
        </div>
      </div>

      {isExpanded && node.children && node.children.length > 0 && (
        <div className="tree-children-container">
          {node.children.map((childAddr, idx) => (
            <TreeNodeComponent
              key={idx}
              addr={childAddr}
              depth={depth + 1}
              treeNodes={treeNodes}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              loadTreeNode={loadTreeNode}
              setLoading={setLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NetworkView({
  userData,
  lifetimeTeamVolume,
  treeRoot,
  treeNodes,
  selectedNode,
  setSelectedNode,
  loadTreeNode,
  setLoading
}) {
  return (
    <div className="view active">
      <div className="card team-card" style={{ marginBottom: "20px" }}>
        <div className="section-title" style={{ marginTop: 0 }}>Referral Network Status</div>
        <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6" }}>
          Earn Level Income up to 10 generations, and Level ROI up to 20 generations. Level ROI unlocks sequentially based on qualified direct referrals with at least 50 USDT deposit (Level L requires L qualified directs).
        </p>
        <div className="team-stats" style={{ marginTop: "20px" }}>
          <div className="team-stat">
            <div className="k">Direct Referrals</div>
            <div className="v">{userData.directCount}</div>
          </div>
          <div className="team-stat">
            <div className="k">Qualified Directs (≥50 USDT)</div>
            <div className="v">{userData.qualifiedDirectsCount}</div>
          </div>
          <div className="team-stat">
            <div className="k">Total Downline Count</div>
            <div className="v">{userData.totalTeamCount}</div>
          </div>
          <div className="team-stat">
            <div className="k">Lifetime Business Value</div>
            <div className="v" style={{ color: "var(--blue-bright)" }}>{lifetimeTeamVolume.toFixed(2)} USDT</div>
          </div>
        </div>
      </div>

      <div className="network-grid">
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="section-title" style={{ marginTop: 0 }}>Interactive Network Tree</div>
          <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "20px" }}>
            Explore your hierarchical MLM tree. Click any node to load and expand its direct referrals. Click the crown icon to inspect the root.
          </p>

          <div className="tree-canvas-container">
            {treeRoot ? (
              <div className="tree-inner-container">
                <TreeNodeComponent
                  addr={treeRoot}
                  depth={0}
                  treeNodes={treeNodes}
                  selectedNode={selectedNode}
                  setSelectedNode={setSelectedNode}
                  loadTreeNode={loadTreeNode}
                  setLoading={setLoading}
                />
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading tree...</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Node Details Inspector</div>
          {selectedNode && treeNodes[selectedNode.toLowerCase()] ? (
            (() => {
              const inspected = treeNodes[selectedNode.toLowerCase()];
              const strongVol = parseFloat(inspected.strongestLegVolume || "0");
              const totalVol = parseFloat(inspected.totalTeamVolume || "0");
              const otherVol = totalVol - strongVol;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <div className="team-stat" style={{ paddingBottom: "10px", borderBottom: "1px solid var(--border)" }}>
                    <div className="k" style={{ fontSize: "11px" }}>Inspected Node</div>
                    <div className="v mono" style={{ fontSize: "11.5px", wordBreak: "break-all", color: "var(--blue-bright)" }}>
                      {inspected.address}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Deposits</div>
                      <div className="v mono" style={{ fontSize: "14px" }}>{parseFloat(inspected.totalDeposits || "0").toFixed(0)} USDT</div>
                    </div>
                    <div>
                      <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Directs</div>
                      <div className="v" style={{ fontSize: "14px" }}>{inspected.directCount} ({inspected.qualifiedDirectsCount} active)</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Team Count</div>
                      <div className="v" style={{ fontSize: "14px" }}>{inspected.totalTeamCount} members</div>
                    </div>
                    <div>
                      <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Team Volume</div>
                      <div className="v mono" style={{ fontSize: "14px" }}>{parseFloat(inspected.totalTeamVolume || "0").toFixed(0)} USDT</div>
                    </div>
                  </div>

                  <div style={{ padding: "10px", background: "var(--surface-2)", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "var(--text-muted)" }}>Sponsor:</span>
                      <span className="mono" style={{ float: "right" }}>{inspected.sponsor !== ethers.ZeroAddress ? shorten(inspected.sponsor) : "None (Root)"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "var(--text-muted)" }}>Strong Leg:</span>
                      <span className="mono" style={{ float: "right" }}>{strongVol.toFixed(0)} USDT</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>Other Legs:</span>
                      <span className="mono" style={{ float: "right" }}>{otherVol.toFixed(0)} USDT</span>
                    </div>
                  </div>

                  {inspected.children && inspected.children.length > 0 && (
                    <div style={{ fontSize: "12px" }}>
                      <div style={{ fontWeight: "600", color: "var(--text-muted)", marginBottom: "6px" }}>Direct Downlines ({inspected.children.length}):</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "100px", overflowY: "auto", paddingRight: "5px" }}>
                        {inspected.children.map((c, i) => (
                          <div key={i} className="mono" style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                            · {c}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "10px 0" }}>
              Click on any node in the tree diagram to inspect its MLM stats and display downlines.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
