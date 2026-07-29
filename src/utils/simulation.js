import { ethers } from "ethers";
import { PERFORMANCE_TIERS } from "../constants/abis.js";
import { safeFloat } from "./formatters.js";

export function calculateLedgerROITotal(ledger) {
  const list = ledger || [];
  const dailyROI = list
    .filter(tx => tx.type === "roi" && tx.amount > 0)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const boosterROI = list
    .filter(tx => tx.type === "booster_roi" && tx.amount > 0)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const roundedDaily = Math.round(dailyROI * 1e8) / 1e8;
  const roundedBooster = Math.round(boosterROI * 1e8) / 1e8;
  const roundedTotal = Math.round((dailyROI + boosterROI) * 1e8) / 1e8;

  return {
    dailyROI: roundedDaily,
    boosterROI: roundedBooster,
    totalROI: roundedTotal
  };
}

export function generateEventsList(
  addr,
  registrationTime,
  totalDeposits,
  dailyROIEarned,
  roiBoosterEarned,
  levelIncomeEarned,
  levelROIEarned,
  performanceBonusEarned,
  boosterRate,
  oneDayVal,
  perfOneDayVal,
  treeNodes,
  activeBonuses,
  userDeposits = [],
  onChainEvents = []
) {
  const regTime = Number(registrationTime || 0);
  if (regTime === 0) {
    return {
      success: true,
      ledger: [],
      totals: { dailyROI: 0, boosterROI: 0, levelIncome: 0, levelROI: 0, performance: 0, totalEarned: 0 },
      validation: { isValid: true, errors: [], diffs: { dailyROI: 0, boosterROI: 0, levelIncome: 0, levelROI: 0, performance: 0 } },
      diagnostics: { generatedTotals: {}, blockchainTotals: {}, categoryDiffs: {}, milestoneViolations: [], capViolations: [], duplicateTxHashes: [], duplicateSimIds: [], chronologicalViolations: [] }
    };
  }

  const ONE_DAY_SECS = Number(oneDayVal) || 1800;
  const PERF_ONE_DAY_SECS = Number(perfOneDayVal) || 480;
  const now = Math.floor(Date.now() / 1000);
  const userAddrLower = addr ? addr.toLowerCase() : "";

  const localActiveBonuses = [...(activeBonuses || [])];
  if (onChainEvents && onChainEvents.length > 0) {
    onChainEvents.forEach(e => {
      if ((e.type === "perf_claim" || e.type === "perf_claim_option2" || e.type === "perf_instant") && e.tierIndex !== undefined && (!e.user || e.user.toLowerCase() === userAddrLower)) {
        const tier = Number(e.tierIndex);
        const rate = PERFORMANCE_TIERS[tier]?.daily || 5;
        const exists = localActiveBonuses.some(b => Math.abs(b.startTime - e.timestamp) < 300);
        if (!exists) {
          localActiveBonuses.push({
            tierIndex: tier,
            dailyRate: rate,
            startTime: e.timestamp,
            endTime: e.timestamp + 30 * PERF_ONE_DAY_SECS,
            lastClaimTime: e.timestamp
          });
        }
      }
    });
  }

  // 1. Prepare user deposits timeline (sorted ascending)
  let sortedDeposits = [];
  if (userDeposits && userDeposits.length > 0) {
    sortedDeposits = userDeposits.map((d, i) => ({
      amount: typeof d.amount === "number" ? d.amount : parseFloat(ethers.formatUnits(d.amount || 0n, 18)),
      timestamp: Number(d.time || d.timestamp || regTime),
      txHash: d.txHash || `0x_dep_${d.timestamp || d.time || regTime}`,
      originalEvent: d.type === "deposit" ? d : {
        type: "deposit",
        typeName: "Deposit",
        fromUser: addr,
        amount: typeof d.amount === "number" ? d.amount : parseFloat(ethers.formatUnits(d.amount || 0n, 18)),
        level: "-",
        timestamp: Number(d.time || d.timestamp || regTime),
        status: "Completed",
        txHash: d.txHash || `0x_dep_${d.timestamp || d.time || regTime}`,
        blockNumber: d.blockNumber || 0
      }
    })).sort((a, b) => a.timestamp - b.timestamp);
  } else {
    const totDepNum = parseFloat(totalDeposits) || 0;
    if (totDepNum > 0) {
      sortedDeposits = [{ amount: totDepNum, timestamp: regTime }];
    }
  }

  if (sortedDeposits.length === 0) {
    const totDepNum = parseFloat(totalDeposits) || 0;
    sortedDeposits = [{ amount: totDepNum, timestamp: regTime }];
  }

  // 2. Prepare Directs & Tree Nodes data for booster rate & level income calculation
  const sponsorAddrLower = addr ? addr.toLowerCase() : "";
  const sponsorNode = treeNodes ? treeNodes[sponsorAddrLower] : null;
  const directAddrs = sponsorNode?.children || [];

  const directsData = [];
  directAddrs.forEach(childAddr => {
    const childNode = treeNodes ? treeNodes[childAddr.toLowerCase()] : null;
    if (childNode) {
      directsData.push({
        address: childAddr,
        registrationTime: Number(childNode.registrationTime || 0),
        totalDeposits: parseFloat(childNode.totalDeposits || 0)
      });
    }
  });

  function getActiveDepositAtTime(timestamp) {
    let depSum = 0;
    for (const dep of sortedDeposits) {
      if (dep.timestamp <= timestamp) {
        depSum += dep.amount;
      }
    }
    return depSum;
  }

  function getQualifiedDirectsCountAtTime(parentAddr, timestamp) {
    if (!treeNodes || !parentAddr) return 0;
    const parentLower = parentAddr.toLowerCase();
    
    const directAddrs = new Set();
    const parentNode = treeNodes[parentLower];
    if (parentNode && parentNode.children) {
      parentNode.children.forEach(c => directAddrs.add(c.toLowerCase()));
    }
    Object.keys(treeNodes).forEach(k => {
      const node = treeNodes[k];
      if (node && node.sponsor && node.sponsor.toLowerCase() === parentLower) {
        directAddrs.add(k.toLowerCase());
      }
    });

    let qualCount = 0;
    directAddrs.forEach(childAddr => {
      const childNode = treeNodes[childAddr];
      if (childNode) {
        let cumVol = 0;
        if (childNode.deposits && childNode.deposits.length > 0) {
          childNode.deposits.forEach(d => {
            const dTime = Number(d.timestamp || d.time || childNode.registrationTime || 0);
            if (dTime <= timestamp) {
              cumVol += typeof d.amount === "number" ? d.amount : parseFloat(d.amount || 0);
            }
          });
        } else {
          const tDep = parseFloat(childNode.totalDeposits) || 0;
          const regTime = Number(childNode.registrationTime || 0);
          if (regTime <= timestamp) {
            cumVol = tDep;
          }
        }
        if (cumVol >= 50) {
          qualCount++;
        }
      }
    });
    return qualCount;
  }

  function getCumulativeDepositAtTime(targetAddr, timestamp) {
    if (!targetAddr) return 0;
    if (targetAddr.toLowerCase() === addr.toLowerCase()) {
      return getActiveDepositAtTime(timestamp);
    }
    const node = treeNodes ? treeNodes[targetAddr.toLowerCase()] : null;
    if (!node) return 0;
    let cum = 0;
    if (node.deposits && node.deposits.length > 0) {
      node.deposits.forEach(d => {
        const dTime = Number(d.timestamp || d.time || node.registrationTime || 0);
        if (dTime <= timestamp) {
          cum += typeof d.amount === "number" ? d.amount : parseFloat(d.amount || 0);
        }
      });
    } else {
      const tDep = parseFloat(node.totalDeposits) || 0;
      const regTime = Number(node.registrationTime || 0);
      if (regTime <= timestamp) {
        cum = tDep;
      }
    }
    return cum;
  }

  const passedBps = Math.round((parseFloat(boosterRate) || 0.5) * 100);

  function getBoosterRateAtTime(timestamp) {
    if (passedBps <= 50) {
      return 50;
    }

    let refs5 = 0, refs10 = 0, refs15 = 0, refs20 = 0, refs25 = 0;
    const currentSponsorDep = getActiveDepositAtTime(timestamp);

    for (const d of directsData) {
      if (d.registrationTime > timestamp) continue;
      if (d.registrationTime > regTime + 25 * ONE_DAY_SECS) continue;

      if (d.totalDeposits >= currentSponsorDep && currentSponsorDep > 0) {
        if (d.registrationTime >= regTime) {
          const diff = d.registrationTime - regTime;
          if (diff <= 5 * ONE_DAY_SECS) refs5++;
          if (diff <= 10 * ONE_DAY_SECS) refs10++;
          if (diff <= 15 * ONE_DAY_SECS) refs15++;
          if (diff <= 20 * ONE_DAY_SECS) refs20++;
          if (diff <= 25 * ONE_DAY_SECS) refs25++;
        }
      }
    }

    let calculatedRate = 50;
    if (refs25 >= 10) calculatedRate = 400;
    else if (refs20 >= 8) calculatedRate = 250;
    else if (refs15 >= 6) calculatedRate = 200;
    else if (refs10 >= 4) calculatedRate = 150;
    else if (refs5 >= 2) calculatedRate = 100;

    return passedBps > 50 ? passedBps : calculatedRate;
  }

  // Calculate total expected daily and booster ROI accrued from elapsed intervals up to now
  let autoAccruedDailyROI = 0;
  let autoAccruedBoosterROI = 0;
  let stepCheck = 1;
  while (true) {
    const checkTime = regTime + stepCheck * ONE_DAY_SECS;
    if (checkTime > now || stepCheck > 2000) break;
    const depAtTime = getActiveDepositAtTime(checkTime);
    if (depAtTime > 0) {
      const rateAtTime = getBoosterRateAtTime(checkTime);
      const baseDailyRate = 50; // 0.5%
      const boosterRate = Math.max(0, rateAtTime - 50);

      autoAccruedDailyROI += (depAtTime * baseDailyRate) / 10000;
      autoAccruedBoosterROI += (depAtTime * boosterRate) / 10000;
    }
    stepCheck++;
  }

  const targetDailyROI = parseFloat(dailyROIEarned) || 0;
  const targetBoosterROI = parseFloat(roiBoosterEarned) || 0;
  const targetLevelIncome = parseFloat(levelIncomeEarned) || 0;
  const targetLevelROI = parseFloat(levelROIEarned) || 0;
  const targetPerf = parseFloat(performanceBonusEarned) || 0;

  // 3. Build Candidate Event Timeline
  const candidateEvents = [];

  sortedDeposits.forEach((dep, idx) => {
    candidateEvents.push({
      type: "user_deposit",
      timestamp: dep.timestamp,
      amount: dep.amount,
      txHash: dep.txHash,
      sortPriority: 1,
      originalEvent: dep.originalEvent || dep
    });
  });

  let candidateLevelIncSum = 0;
  if (treeNodes && Object.keys(treeNodes).length > 0) {
    Object.keys(treeNodes).forEach(childAddr => {
      if (childAddr.toLowerCase() === addr.toLowerCase()) return;
      const node = treeNodes[childAddr];
      if (node) {
        let depsToUse = node.deposits;
        if (!depsToUse || depsToUse.length === 0) {
          const tDep = parseFloat(node.totalDeposits) || 0;
          if (tDep > 0) {
            depsToUse = [{ amount: tDep, timestamp: node.registrationTime || regTime }];
          }
        }

        if (depsToUse && depsToUse.length > 0) {
          depsToUse.forEach((dep, dIdx) => {
            let level = 0;
            let current = node;
            let foundLevel = 0;
            while (current && current.sponsor && current.sponsor !== "0x0000000000000000000000000000000000000000" && level < 20) {
              level++;
              if (current.sponsor.toLowerCase() === addr.toLowerCase()) {
                foundLevel = level;
                break;
              }
              current = treeNodes[current.sponsor.toLowerCase()];
            }
            if (foundLevel > 0 && foundLevel <= 5) {
              const depTime = Number(dep.timestamp || node.registrationTime || regTime);
              const parentDepAtTime = getCumulativeDepositAtTime(addr, depTime);
              const qualDirectsAtTime = getQualifiedDirectsCountAtTime(addr, depTime);

              // Smart contract rule: Recipient (parent) total deposits >= 10 USDT and qualifiedDirectsCount >= foundLevel
              if (parentDepAtTime >= 10 && qualDirectsAtTime >= foundLevel) {
                const levelPct = [0.05, 0.02, 0.01, 0.01, 0.01][foundLevel - 1] || 0;
                const depAmt = typeof dep.amount === "number" ? dep.amount : parseFloat(dep.amount || 0);
                const totalAmt = depAmt * levelPct;
                if (totalAmt > 0) {
                  let remAmt = totalAmt;
                  let partIdx = 0;
                  const maxVal = 500;
                  while (remAmt > 0.001) {
                    const partAmt = Math.min(maxVal, remAmt);
                    const offsetTime = depTime + (partIdx * 60);
                    candidateEvents.push({
                      type: "candidate_level_income",
                      typeName: "Level Income",
                      fromUser: childAddr,
                      amount: Math.round(partAmt * 1e8) / 1e8,
                      level: foundLevel.toString(),
                      timestamp: offsetTime,
                      sortPriority: 3,
                      txHash: `0x_gen_lvl_inc_${childAddr.toLowerCase()}_${dIdx}_${offsetTime}_${partIdx}`
                    });
                    candidateLevelIncSum += partAmt;
                    remAmt = Math.round((remAmt - partAmt) * 1e8) / 1e8;
                    partIdx++;
                  }
                }
              }
            }
          });
        }
      }
    });
  }



  // Generate candidate ROI ticks for each deposit independently
  const realRoiEventsSorted = (onChainEvents || [])
    .filter(e => !e.isSimulated && e.type === "roi" && (!e.user || e.user.toLowerCase() === userAddrLower))
    .sort((a, b) => a.timestamp - b.timestamp);

  const realBoosterEventsSorted = (onChainEvents || [])
    .filter(e => !e.isSimulated && e.type === "booster_roi" && (!e.user || e.user.toLowerCase() === userAddrLower))
    .sort((a, b) => a.timestamp - b.timestamp);

  const maxRealRoiTime = realRoiEventsSorted.length > 0
    ? Math.max(...realRoiEventsSorted.map(e => Number(e.timestamp)))
    : 0;

  sortedDeposits.forEach((dep, depIdx) => {
    let intervalTick = dep.timestamp + ONE_DAY_SECS;
    let day = 1;
    while (intervalTick <= now) {
      // Find near real event to borrow txHash if available
      let matchedTxHash = null;
      let matchedBoosterTxHash = null;
      
      for (let e of realRoiEventsSorted) {
        if (Math.abs(e.timestamp - intervalTick) <= (ONE_DAY_SECS / 2)) {
          matchedTxHash = e.txHash;
          break;
        }
      }
      for (let e of realBoosterEventsSorted) {
        if (Math.abs(e.timestamp - intervalTick) <= (ONE_DAY_SECS / 2)) {
          matchedBoosterTxHash = e.txHash;
          break;
        }
      }

      candidateEvents.push({
        type: "candidate_roi_tick",
        depositIndex: depIdx,
        day: day,
        timestamp: intervalTick,
        txHash: matchedTxHash,
        boosterTxHash: matchedBoosterTxHash,
        sortPriority: 5
      });
      intervalTick += ONE_DAY_SECS;
      day++;
    }
  });

  if (localActiveBonuses && localActiveBonuses.length > 0) {
    localActiveBonuses.forEach((bonus) => {
      const streamStart = Number(bonus.startTime);
      const streamEnd = bonus.endTime > 0 ? Number(bonus.endTime) : streamStart + 30 * PERF_ONE_DAY_SECS;
      const streamId = `${bonus.tierIndex !== undefined ? bonus.tierIndex : '0'}_${streamStart}_${bonus.txHash || bonus.claimTxHash || ""}`;

      for (let day = 1; day <= 30; day++) {
        const salaryTime = streamStart + day * PERF_ONE_DAY_SECS;
        if (salaryTime > streamEnd) break;

        candidateEvents.push({
          type: "candidate_perf_daily",
          streamId: streamId,
          day: day,
          dailyRate: bonus.dailyRate,
          startTime: streamStart,
          endTime: streamEnd,
          tierIndex: bonus.tierIndex,
          timestamp: salaryTime,
          sortPriority: 7
        });
      }
    });
  }

  const realLevelROIEvents = (onChainEvents || [])
    .filter(e => !e.isSimulated && e.type === "level_roi" && (!e.user || e.user.toLowerCase() === userAddrLower));
  const hasRealLevelROI = realLevelROIEvents.length > 0;

  let candidateLevelROISum = 0;
  if (targetLevelROI > 0 && treeNodes && !hasRealLevelROI) {
    const downlineContributions = [];
    const levelROIPct = [
      0.15, 0.10, 0.05, 0.05, 0.05,
      0.04, 0.04, 0.04, 0.04, 0.04,
      0.03, 0.03, 0.03, 0.03, 0.03,
      0.02, 0.02, 0.02, 0.02, 0.02
    ];

    Object.keys(treeNodes).forEach(childAddr => {
      if (childAddr.toLowerCase() === addr.toLowerCase()) return;
      const node = treeNodes[childAddr];
      const tDep = parseFloat(node.totalDeposits) || 0;
      if (tDep > 0) {
        let level = 0;
        let current = node;
        let foundLevel = 0;
        while (current && current.sponsor && current.sponsor !== "0x0000000000000000000000000000000000000000" && level < 20) {
          level++;
          if (current.sponsor.toLowerCase() === addr.toLowerCase()) {
            foundLevel = level;
            break;
          }
          current = treeNodes[current.sponsor.toLowerCase()];
        }
        if (foundLevel > 0 && foundLevel <= 20) {
          const childRegTime = Number(node.registrationTime || regTime);
          const childDepAtTime = getCumulativeDepositAtTime(childAddr, childRegTime);
          const parentDepAtTime = getCumulativeDepositAtTime(addr, childRegTime);
          const qualDirectsAtTime = getQualifiedDirectsCountAtTime(addr, childRegTime);

          if (childDepAtTime >= 50 && parentDepAtTime >= 50 && qualDirectsAtTime >= foundLevel) {
            const expectedDaily = tDep * 0.005 * (levelROIPct[foundLevel - 1] || 0);
            if (expectedDaily > 0) {
              downlineContributions.push({ addr: childAddr, level: foundLevel, expectedDaily, childRegTime });
            }
          }
        }
      }
    });

    let dayOffset = 1;
    let iteration = 0;
    while (candidateLevelROISum < targetLevelROI - 0.01 && downlineContributions.length > 0 && iteration < 200) {
      for (let cIdx = 0; cIdx < downlineContributions.length; cIdx++) {
        const dc = downlineContributions[cIdx];
        const payoutTime = Math.max(dc.childRegTime, regTime) + dayOffset * ONE_DAY_SECS + (cIdx * 10);
        candidateEvents.push({
          type: "candidate_level_roi",
          typeName: "Level ROI Matching",
          fromUser: dc.addr,
          amount: dc.expectedDaily,
          level: dc.level.toString(),
          timestamp: payoutTime,
          sortPriority: 4,
          txHash: `0x_gen_lvl_roi_${dc.addr.toLowerCase()}_${dayOffset}_${dc.level}`
        });
        candidateLevelROISum += dc.expectedDaily;
      }
      dayOffset++;
      iteration++;
    }
  }

  // Sort candidateEvents
  candidateEvents.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.sortPriority - b.sortPriority;
  });

  // Replay State
  let currentDeposit = 0;
  let accumulatedDailyROI = 0;
  let accumulatedBoosterROI = 0;
  let accumulatedLevelIncome = 0;
  let accumulatedLevelROI = 0;
  let accumulatedPerf = 0;
  let cumulativeTotalEarned = 0;

  const activeDepositsList = [];
  const generated = [];
  const streamEarnedMap = {}; // Tracks earned amount per active daily performance stream

  const realRoiEvents = (onChainEvents || [])
    .filter(e => e.type === "roi" && !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower));
  const lastUpdateROI = realRoiEvents.length > 0 ? Math.max(...realRoiEvents.map(e => e.timestamp)) : regTime;

  const realBoosterEvents = (onChainEvents || [])
    .filter(e => e.type === "booster_roi" && !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower));
  const lastUpdateBooster = realBoosterEvents.length > 0 ? Math.max(...realBoosterEvents.map(e => e.timestamp)) : regTime;

  const realPerfEvents = (onChainEvents || [])
    .filter(e => e.type === "perf_daily" && !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower));
  const lastUpdatePerf = realPerfEvents.length > 0 ? Math.max(...realPerfEvents.map(e => e.timestamp)) : regTime;

  // Real events in onChainEvents that directly add to timeline (excluding deposits and ROI which are simulated perfectly)
  const realOnChainEvents = (onChainEvents || []).filter(e => 
    !e.isSimulated &&
    (!e.user || e.user.toLowerCase() === userAddrLower) &&
    e.type !== "deposit" &&
    e.type !== "roi" &&
    e.type !== "booster_roi"
  );

  realOnChainEvents.forEach(e => {
    let priority = 2;
    if (e.type === "withdraw") priority = 8;

    candidateEvents.push({
      type: "real_on_chain",
      incomeType: e.type,
      amount: e.amount,
      timestamp: e.timestamp,
      sortPriority: priority,
      originalEvent: e
    });
  });

  // Re-sort everything to ensure strict chronological order with priority
  candidateEvents.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.sortPriority - b.sortPriority;
  });

  // Helper to check if a candidate event is a duplicate of a real on-chain transaction
  function isDuplicateOfReal(simEvt) {
    return (onChainEvents || []).some(real => {
      if (real.isSimulated) return false;

      if (real.txHash && simEvt.txHash && real.txHash.length === 66 && simEvt.txHash.length === 66 && !real.txHash.includes("_") && !simEvt.txHash.includes("_")) {
        return real.txHash.toLowerCase() === simEvt.txHash.toLowerCase();
      }

      const realType = real.type;
      const simType = simEvt.type.replace("candidate_", "").replace("_tick", "");
      if (realType !== simType) return false;

      const isSameUser = real.fromUser && simEvt.fromUser && real.fromUser.toLowerCase() === simEvt.fromUser.toLowerCase();
      const isSameLevel = real.level !== undefined && simEvt.level !== undefined && String(real.level) === String(simEvt.level);
      const isSameAmount = Math.abs((parseFloat(real.amount) || 0) - (parseFloat(simEvt.amount) || 0)) < 0.01;

      if (realType === "level_income") {
        return isSameUser && isSameLevel && isSameAmount && Math.abs((real.timestamp || 0) - (simEvt.timestamp || 0)) < 60;
      }

      return isSameUser && isSameLevel && isSameAmount;
    });
  }

  // Helper function to update active/inactive state of deposits
  function updateDepositStates() {
    activeDepositsList.forEach(dep => {
      const isRoiSatisfied = targetDailyROI <= 0 || accumulatedDailyROI >= targetDailyROI - 0.0001;
      if (cumulativeTotalEarned >= dep.roiStopAt - 0.0001 && isRoiSatisfied) {
        dep.roiActive = false;
      }
    });
  }

  // Process timeline events
  for (const evt of candidateEvents) {
    const maxNetworkCap = currentDeposit * 4.0;

    if (evt.type === "user_deposit" || evt.type === "deposit") {
      const orig = evt.originalEvent || {};
      generated.push({
        ...orig,
        type: "deposit",
        typeName: orig.typeName || "Deposit",
        fromUser: orig.fromUser || orig.user || orig.from || "-",
        amount: evt.amount,
        level: orig.level !== undefined ? orig.level : "-",
        timestamp: evt.timestamp,
        status: orig.status || "Completed",
        txHash: evt.txHash || orig.txHash || `0x_dep_${evt.timestamp}`,
        blockNumber: orig.blockNumber || 0
      });
      currentDeposit += evt.amount;
      activeDepositsList.push({
        amount: evt.amount,
        timestamp: evt.timestamp,
        roiStopAt: currentDeposit * 2.2,
        roiActive: true
      });
      updateDepositStates();
      continue;
    }

    if (evt.type === "real_on_chain") {
      const amt = evt.amount;
      const orig = evt.originalEvent || {};
      const calculatedTypeName = orig.typeName || (
        evt.incomeType === "deposit" ? "Deposit" :
        evt.incomeType === "withdraw" ? "Withdrawal" :
        evt.incomeType === "level_income" ? "Level Income" :
        evt.incomeType === "level_roi" ? "Level ROI" :
        evt.incomeType === "roi" ? "Daily ROI" :
        evt.incomeType === "booster_roi" ? "Booster ROI" :
        ["perf_instant", "perf_daily", "perf_claim"].includes(evt.incomeType) ? "Performance Bonus" : "Transaction"
      );
      generated.push({
        ...orig,
        type: orig.type || evt.incomeType || "transaction",
        typeName: calculatedTypeName,
        fromUser: orig.fromUser || orig.user || orig.from || "-",
        amount: amt,
        level: orig.level !== undefined ? orig.level : "-",
        timestamp: evt.timestamp,
        status: orig.status || "Completed",
        txHash: orig.txHash || evt.txHash || `0x_real_${evt.timestamp}`
      });

      if (evt.incomeType !== "withdraw") {
        cumulativeTotalEarned += amt;
        if (evt.incomeType === "level_income") {
          accumulatedLevelIncome += amt;
        } else if (evt.incomeType === "level_roi") {
          accumulatedLevelROI += amt;
        } else if (evt.incomeType === "perf_claim" || evt.incomeType === "perf_instant" || evt.incomeType === "perf_daily") {
          accumulatedPerf += amt;
        } else if (evt.incomeType === "roi") {
          accumulatedDailyROI += amt;
        } else if (evt.incomeType === "booster_roi") {
          accumulatedBoosterROI += amt;
        }
        updateDepositStates();
      }
      continue;
    }

    // Global cap check
    if (currentDeposit > 0 && cumulativeTotalEarned >= maxNetworkCap - 0.0001) {
      continue;
    }

    if (evt.type === "candidate_level_income") {
      if (isDuplicateOfReal(evt)) continue;

      let maxCandidateAllowed = targetLevelIncome;
      if (targetLevelIncome > 0) {
        const remRealLevelIncome = candidateEvents
          .filter(e => e.type === "real_on_chain" && e.incomeType === "level_income" && e.timestamp >= evt.timestamp)
          .reduce((s, e) => s + e.amount, 0);
        maxCandidateAllowed = Math.max(0, targetLevelIncome - remRealLevelIncome);
      }

      if (targetLevelIncome > 0 && accumulatedLevelIncome >= maxCandidateAllowed - 0.001) continue;

      let amt = evt.amount;
      if (targetLevelIncome > 0 && accumulatedLevelIncome + amt > maxCandidateAllowed) {
        amt = maxCandidateAllowed - accumulatedLevelIncome;
      }
      const remNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);
      amt = Math.min(amt, remNetCap);
      amt = Math.round(amt * 1e8) / 1e8;

      if (amt > 0) {
        generated.push({
          type: "level_income",
          typeName: evt.typeName,
          fromUser: evt.fromUser,
          amount: amt,
          level: evt.level,
          timestamp: evt.timestamp,
          status: "Completed",
          txHash: evt.txHash,
          blockNumber: 0
        });
        accumulatedLevelIncome += amt;
        cumulativeTotalEarned += amt;
        updateDepositStates();
      }
      continue;
    }

    if (evt.type === "candidate_level_roi") {
      if (hasRealLevelROI) continue;
      if (isDuplicateOfReal(evt)) continue;
      if (targetLevelROI > 0 && accumulatedLevelROI >= targetLevelROI - 0.001) continue;

      let amt = evt.amount;

      const remNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);
      amt = Math.min(amt, remNetCap);
      amt = Math.round(amt * 1e8) / 1e8;

      if (amt > 0) {
        generated.push({
          type: "level_roi",
          typeName: "Level ROI Matching",
          fromUser: evt.fromUser,
          amount: amt,
          level: evt.level,
          timestamp: evt.timestamp,
          status: "Completed",
          txHash: evt.txHash,
          blockNumber: 0
        });
        accumulatedLevelROI += amt;
        cumulativeTotalEarned += amt;
        updateDepositStates();
      }
      continue;
    }

    if (evt.type === "candidate_roi_tick") {
      const deposit = activeDepositsList[evt.depositIndex];
      if (!deposit || deposit.timestamp > evt.timestamp || !deposit.roiActive) continue;
      if (cumulativeTotalEarned >= maxNetworkCap - 0.0001) continue;

      const isHistorical = evt.timestamp <= maxRealRoiTime;

      // Base daily ROI rate per 1-day interval is 0.5% (50 bps)
      const baseRateBps = 50;
      let boosterRateBps = 0;
      let matchedBoosterTxHash = evt.boosterTxHash;

      if (evt.depositIndex === 0) {
        if (isHistorical) {
          // Rule 2: For historical ticks, check whether a real blockchain Booster ROI event exists for this tick
          const realBoosterMatch = realBoosterEventsSorted.find(e =>
            !e._consumed && Math.abs(e.timestamp - evt.timestamp) <= (ONE_DAY_SECS / 2)
          );
          if (realBoosterMatch) {
            realBoosterMatch._consumed = true;
            boosterRateBps = Math.round((realBoosterMatch.amount * 10000) / deposit.amount);
            if (boosterRateBps <= 0) boosterRateBps = 50; // Fallback if exact BPS calculation rounds down
            matchedBoosterTxHash = realBoosterMatch.txHash || matchedBoosterTxHash;
          }
          // If no real booster event exists, boosterRateBps remains 0. (Do NOT call getBoosterRateAtTime)
        } else {
          // Rule 3: For future simulation ticks, calculate booster rate using getBoosterRateAtTime
          const rateBps = getBoosterRateAtTime(evt.timestamp);
          if (rateBps > 50) {
            boosterRateBps = rateBps - 50;
          }
        }
      }

      const totalRateBps = baseRateBps + boosterRateBps;
      let accrued = (deposit.amount * totalRateBps) / 10000;

      const remMilestone = Math.max(0, deposit.roiStopAt - cumulativeTotalEarned);
      const remNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);
      let allowed = Math.min(accrued, remMilestone, remNetCap);
      allowed = Math.round(allowed * 1e8) / 1e8;

      if (allowed > 0) {
        let pDaily = Math.round(((allowed * baseRateBps) / totalRateBps) * 1e8) / 1e8;
        if (pDaily > allowed) pDaily = allowed;
        const pBooster = Math.round((allowed - pDaily) * 1e8) / 1e8;

        if (pDaily > 0) {
          generated.push({
            type: "roi",
            typeName: "Daily ROI Payout",
            fromUser: "Contract",
            amount: pDaily,
            level: "-",
            timestamp: evt.timestamp,
            status: "Completed",
            txHash: evt.txHash || `0x_gen_roi_${deposit.timestamp}_dep${evt.depositIndex}_${evt.day}`,
            blockNumber: 0
          });
          accumulatedDailyROI += pDaily;
        }

        if (pBooster > 0) {
          generated.push({
            type: "booster_roi",
            typeName: "Booster ROI Yield",
            fromUser: "Contract",
            amount: pBooster,
            level: "-",
            timestamp: evt.timestamp,
            status: "Completed",
            txHash: matchedBoosterTxHash || `0x_gen_booster_${deposit.timestamp}_dep${evt.depositIndex}_${evt.day}`,
            blockNumber: 0
          });
          accumulatedBoosterROI += pBooster;
        }

        cumulativeTotalEarned += (pDaily + pBooster);
        updateDepositStates();
      }
      continue;
    }

    if (evt.type === "candidate_perf_daily") {
      if (isDuplicateOfReal(evt)) continue;
      const maxCap = 30 * evt.dailyRate;
      const streamEarned = streamEarnedMap[evt.streamId] || 0;
      if (streamEarned >= maxCap - 0.001) continue;

      if (targetPerf > 0 && accumulatedPerf >= targetPerf - 0.0001) continue;

      let amt = evt.dailyRate;
      const remStreamCap = Math.max(0, maxCap - streamEarned);
      amt = Math.min(amt, remStreamCap);

      if (targetPerf > 0 && accumulatedPerf + amt > targetPerf) {
        amt = targetPerf - accumulatedPerf;
      }
      const remNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);
      amt = Math.min(amt, remNetCap);
      amt = Math.round(amt * 1e8) / 1e8;

      if (amt > 0) {
        generated.push({
          type: "perf_daily",
          typeName: "Performance Daily Salary",
          fromUser: "Contract",
          amount: amt,
          level: "-",
          timestamp: evt.timestamp,
          status: "Completed",
          txHash: `0x_gen_perf_daily_${evt.startTime}_${evt.day}`,
          blockNumber: 0,
          tierIndex: evt.tierIndex
        });
        accumulatedPerf += amt;
        cumulativeTotalEarned += amt;
        streamEarnedMap[evt.streamId] = streamEarned + amt;
        updateDepositStates();
      }
      continue;
    }
  }

  // Exhaustive Validation & Diagnostics
  const genDailyROI = Math.round(generated.filter(e => e.type === "roi").reduce((s, e) => s + e.amount, 0) * 1e8) / 1e8;
  const genBoosterROI = Math.round(generated.filter(e => e.type === "booster_roi").reduce((s, e) => s + e.amount, 0) * 1e8) / 1e8;
  const genLevelInc = Math.round(generated.filter(e => e.type === "level_income").reduce((s, e) => s + e.amount, 0) * 1e8) / 1e8;
  const genLevelROI = Math.round(generated.filter(e => e.type === "level_roi").reduce((s, e) => s + e.amount, 0) * 1e8) / 1e8;
  const genPerf = Math.round(generated.filter(e => e.type === "perf_daily" || e.type === "perf_instant" || e.type === "perf_claim").reduce((s, e) => s + e.amount, 0) * 1e8) / 1e8;
  const genTotalEarned = Math.round((genDailyROI + genBoosterROI + genLevelInc + genLevelROI + genPerf) * 1e8) / 1e8;

  const diffDailyROI = Math.round(Math.abs(genDailyROI - targetDailyROI) * 1e8) / 1e8;
  const diffBoosterROI = Math.round(Math.abs(genBoosterROI - targetBoosterROI) * 1e8) / 1e8;
  const diffLevelInc = Math.round(Math.abs(genLevelInc - targetLevelIncome) * 1e8) / 1e8;
  const diffLevelROI = Math.round(Math.abs(genLevelROI - targetLevelROI) * 1e8) / 1e8;
  const diffPerf = Math.round(Math.abs(genPerf - targetPerf) * 1e8) / 1e8;

  const validationErrors = [];
  if (targetDailyROI > 0 && diffDailyROI > 0.05) {
    validationErrors.push(`Daily ROI mismatch. Generated: ${genDailyROI}, Blockchain Target: ${targetDailyROI}, Difference: ${diffDailyROI}`);
  }
  if (targetBoosterROI > 0 && diffBoosterROI > 0.05) {
    validationErrors.push(`Booster ROI mismatch. Generated: ${genBoosterROI}, Blockchain Target: ${targetBoosterROI}, Difference: ${diffBoosterROI}`);
  }
  if (targetLevelIncome > 0 && genLevelInc > targetLevelIncome + 0.05) {
    validationErrors.push(`Level Income mismatch. Generated: ${genLevelInc}, Blockchain Target: ${targetLevelIncome}, Difference: ${diffLevelInc}`);
  }
  if (targetLevelROI > 0 && genLevelROI > targetLevelROI + 0.05) {
    validationErrors.push(`Level ROI mismatch. Generated: ${genLevelROI}, Blockchain Target: ${targetLevelROI}, Difference: ${diffLevelROI}`);
  }
  if (targetPerf > 0 && diffPerf > 0.05) {
    validationErrors.push(`Performance Bonus mismatch. Generated: ${genPerf}, Blockchain Target: ${targetPerf}, Difference: ${diffPerf}`);
  }

  // Duplicate txHash check (checking for duplicate event types under the same real txHash)
  const txHashTypeCounts = {};
  const duplicateTxHashes = [];
  generated.forEach(e => {
    if (e.txHash && !e.txHash.includes("_")) {
      const key = `${e.txHash}_${e.type}_${e.amount}_${e.fromUser || ''}`;
      txHashTypeCounts[key] = (txHashTypeCounts[key] || 0) + 1;
      if (txHashTypeCounts[key] > 1 && !duplicateTxHashes.includes(e.txHash)) {
        duplicateTxHashes.push(e.txHash);
        validationErrors.push(`Duplicate transaction hash detected: ${e.txHash}`);
      }
    }
  });

  // Chronological order check
  const chronologicalViolations = [];
  for (let i = 1; i < generated.length; i++) {
    if (generated[i].timestamp < generated[i - 1].timestamp) {
      chronologicalViolations.push(`Chronological violation at index ${i}: timestamp ${generated[i].timestamp} < ${generated[i - 1].timestamp}`);
      validationErrors.push(`Chronological timestamp sequence violation at index ${i}`);
    }
  }

  const isValid = validationErrors.length === 0;

  return {
    success: isValid,
    ledger: generated,
    totals: {
      dailyROI: genDailyROI,
      boosterROI: genBoosterROI,
      levelIncome: genLevelInc,
      levelROI: genLevelROI,
      performance: genPerf,
      totalEarned: genTotalEarned
    },
    validation: {
      isValid: isValid,
      errors: validationErrors,
      diffs: {
        dailyROI: diffDailyROI,
        boosterROI: diffBoosterROI,
        levelIncome: diffLevelInc,
        levelROI: diffLevelROI,
        performance: diffPerf
      }
    },
    diagnostics: {
      generatedTotals: { dailyROI: genDailyROI, boosterROI: genBoosterROI, levelIncome: genLevelInc, levelROI: genLevelROI, performance: genPerf },
      blockchainTotals: { dailyROI: targetDailyROI, boosterROI: targetBoosterROI, levelIncome: targetLevelIncome, levelROI: targetLevelROI, performance: targetPerf },
      categoryDiffs: { dailyROI: diffDailyROI, boosterROI: diffBoosterROI, levelIncome: diffLevelInc, levelROI: diffLevelROI, performance: diffPerf },
      milestoneViolations: [],
      capViolations: [],
      duplicateTxHashes: duplicateTxHashes,
      duplicateSimIds: [],
      chronologicalViolations: chronologicalViolations
    }
  };
}

export function generateSimulatedLedger(addr, basicInfo, incomeInfo, directs, currentOneDayVal, loadedDirectsMap = {}, userDeposits = [], currentPerfOneDayVal = 86400n, activeBonuses = []) {
  const sponsorJoin = Number(basicInfo?.registrationTime || 0);
  const sponsorDeposit = basicInfo && basicInfo.totalDeposits !== undefined && basicInfo.totalDeposits !== null
    ? (typeof basicInfo.totalDeposits === "bigint" ? safeFloat(ethers.formatUnits(basicInfo.totalDeposits, 18)) : parseFloat(basicInfo.totalDeposits || 0))
    : 0;
  const ONE_DAY_SECS = Number(currentOneDayVal || 86400n);
  const PERF_ONE_DAY_SECS = Number(currentPerfOneDayVal || 86400n);
  const now = Math.floor(Date.now() / 1000);
  const numDays = Math.floor((now - sponsorJoin) / ONE_DAY_SECS);

  const sortedDeps = [...userDeposits].sort((a, b) => a.timestamp - b.timestamp);
  const upgradeDepositsSum = sortedDeps
    .filter(d => d.timestamp > sponsorJoin)
    .reduce((sum, d) => sum + d.amount, 0);
  const initialDep = Math.max(0, sponsorDeposit - upgradeDepositsSum);

  function getActiveDepositAtTime(timestamp) {
    let activeDep = initialDep;
    sortedDeps.forEach(dep => {
      if (dep.timestamp <= timestamp && dep.timestamp > sponsorJoin) {
        activeDep += dep.amount;
      }
    });
    return activeDep;
  }

  if (!basicInfo || Number(basicInfo.registrationTime) === 0 || basicInfo.totalDeposits === 0n) {
    return [];
  }

  const totalEarnedSoFar = incomeInfo ? (
    safeFloat(ethers.formatUnits(incomeInfo.dailyROIEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.roiBoosterEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.levelIncomeEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.levelROIEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.performanceBonusEarned || 0n, 18))
  ) : 0;

  const maxNetCap = sponsorDeposit * 4.0;
  if (totalEarnedSoFar >= maxNetCap) {
    return [];
  }

  const list = [];

  activeBonuses.forEach((bonus, bIdx) => {
    const streamStart = Number(bonus.startTime);
    const streamEnd = Math.min(now, Number(bonus.endTime));
    const streamDays = Math.floor((streamEnd - streamStart) / PERF_ONE_DAY_SECS);
    for (let day = 1; day <= streamDays; day++) {
      const salaryTime = streamStart + day * PERF_ONE_DAY_SECS;
      list.push({
        type: "perf_daily",
        typeName: "Performance Daily Salary",
        fromUser: "Contract",
        amount: bonus.dailyRate,
        level: "-",
        timestamp: salaryTime,
        status: "Completed",
        txHash: `0x_salary_${bIdx}_${day}`,
        blockNumber: 0,
        isSimulated: true
      });
    }
  });

  return list;
}
