import { ethers } from "ethers";
import { PERFORMANCE_TIERS } from "../constants/abis.js";
import { safeFloat } from "./formatters.js";

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
  if (regTime === 0) return [];

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
        const exists = localActiveBonuses.some(b => b.tierIndex === tier);
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
      timestamp: Number(d.time || d.timestamp || regTime)
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

  const targetDailyROI = Math.max(parseFloat(dailyROIEarned) || 0, autoAccruedDailyROI);
  const targetBoosterROI = Math.max(parseFloat(roiBoosterEarned) || 0, autoAccruedBoosterROI);
  const targetLevelIncome = parseFloat(levelIncomeEarned) || 0;
  const targetLevelROI = parseFloat(levelROIEarned) || 0;
  const targetPerf = parseFloat(performanceBonusEarned) || 0;

  // 3. Build Candidate Event Timeline
  const candidateEvents = [];
  const fallbackTimeBase = Math.max(
    regTime,
    ...(sortedDeposits || []).map(d => d.timestamp || regTime),
    ...(onChainEvents || []).map(e => e.timestamp || regTime)
  ) + 60;

  sortedDeposits.forEach((dep, idx) => {
    candidateEvents.push({
      type: "user_deposit",
      timestamp: dep.timestamp,
      amount: dep.amount,
      sortPriority: 1
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
                      sortPriority: 2,
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

  let totalCandidateLevelIncSum = candidateLevelIncSum;
  if (onChainEvents && onChainEvents.length > 0) {
    onChainEvents.forEach(e => {
      if (!e.isSimulated && e.type === "level_income" && (!e.user || e.user.toLowerCase() === userAddrLower)) {
        totalCandidateLevelIncSum += typeof e.amount === "number" ? e.amount : parseFloat(e.amount || 0);
      }
    });
  }

  if (targetLevelIncome > 0 && totalCandidateLevelIncSum < targetLevelIncome - 0.01) {
    const diff = targetLevelIncome - totalCandidateLevelIncSum;
    let fallbackL1Addr = "Downline";
    if (treeNodes && Object.keys(treeNodes).length > 0) {
      const l1Child = Object.keys(treeNodes).find(childAddr => {
        const node = treeNodes[childAddr];
        return node.sponsor && node.sponsor.toLowerCase() === addr.toLowerCase();
      });
      if (l1Child) {
        fallbackL1Addr = l1Child;
      }
    }

    let remDiff = diff;
    let incIdx = 0;
    const maxPerEntry = 500;
    while (remDiff > 0.001 && incIdx < 100) {
      const entryAmt = Math.min(maxPerEntry, remDiff);
      candidateEvents.push({
        type: "candidate_level_income",
        typeName: "Level Income",
        fromUser: fallbackL1Addr,
        amount: Math.round(entryAmt * 1e8) / 1e8,
        level: "1",
        timestamp: fallbackTimeBase + (incIdx * 10),
        sortPriority: 2,
        txHash: `0x_gen_lvl_inc_unbundled_${regTime}_${incIdx}`
      });
      remDiff = Math.round((remDiff - entryAmt) * 1e8) / 1e8;
      incIdx++;
    }
  }

  const maxRoiSimulationTime = now;
  sortedDeposits.forEach((dep, depIdx) => {
    let day = 1;
    while (true) {
      const payoutTime = dep.timestamp + day * ONE_DAY_SECS;
      if (payoutTime > maxRoiSimulationTime || day > 2000) break;

      candidateEvents.push({
        type: "candidate_roi",
        depIdx: depIdx,
        depAmount: dep.amount,
        depTimestamp: dep.timestamp,
        isFirstDeposit: depIdx === 0,
        day: day,
        timestamp: payoutTime,
        sortPriority: 3
      });
      day++;
    }
  });

  if (localActiveBonuses && localActiveBonuses.length > 0) {
    const instantClaimedTiers = new Set();
    if (onChainEvents && onChainEvents.length > 0) {
      onChainEvents.forEach(e => {
        if (e.type === "perf_instant" && (!e.user || e.user.toLowerCase() === userAddrLower)) {
          if (e.tierIndex !== undefined && e.tierIndex !== null) {
            instantClaimedTiers.add(Number(e.tierIndex));
          } else {
            PERFORMANCE_TIERS.forEach((t, idx) => {
              if (Math.abs((parseFloat(e.amount) || 0) - t.instant) < 0.01) {
                instantClaimedTiers.add(idx);
              }
            });
          }
        }
      });
    }

    const uniqueBonuses = [];
    localActiveBonuses.forEach(b => {
      if (b.tierIndex !== undefined && instantClaimedTiers.has(Number(b.tierIndex))) return;
      const isDup = uniqueBonuses.some(ub => 
        (ub.tierIndex !== undefined && ub.tierIndex === b.tierIndex) ||
        Math.abs(ub.startTime - b.startTime) < 300
      );
      if (!isDup) uniqueBonuses.push(b);
    });

    let realPerfSumOnChain = 0;
    if (onChainEvents && onChainEvents.length > 0) {
      onChainEvents.forEach(e => {
        if (e.type === "perf_daily" && !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower)) {
          realPerfSumOnChain += e.amount;
        }
      });
    }

    let totalMaxAllowedPerf = 0;
    uniqueBonuses.forEach(b => {
      totalMaxAllowedPerf += 30 * b.dailyRate;
    });

    let remainingPerfAmount = totalMaxAllowedPerf;
    let simulatedCandidatePerfSum = 0;

    uniqueBonuses.forEach((bonus, bIdx) => {
      if (bonus.tierIndex !== undefined && instantClaimedTiers.has(Number(bonus.tierIndex))) {
        return;
      }
      if (simulatedCandidatePerfSum >= remainingPerfAmount - 0.01) {
        return;
      }

      const streamStart = bonus.startTime;
      const streamEnd = bonus.endTime > 0 ? bonus.endTime : streamStart + 30 * PERF_ONE_DAY_SECS;

      let day = 1;
      while (true) {
        const salaryTime = streamStart + day * PERF_ONE_DAY_SECS;
        if (salaryTime > streamEnd || salaryTime > now || day > 30) break;

        if (simulatedCandidatePerfSum + bonus.dailyRate > remainingPerfAmount + 0.01) {
          break;
        }

        candidateEvents.push({
          type: "candidate_perf_daily",
          bIdx: bIdx,
          day: day,
          dailyRate: bonus.dailyRate,
          startTime: streamStart,
          endTime: streamEnd,
          tierIndex: bonus.tierIndex,
          timestamp: salaryTime,
          sortPriority: 4
        });

        simulatedCandidatePerfSum += bonus.dailyRate;
        day++;
      }
    });
  }

  let totalCandidatePerfSum = 0;
  candidateEvents.forEach(e => {
    if (e.type === "candidate_perf_daily") totalCandidatePerfSum += (e.dailyRate || 0);
  });
  if (onChainEvents && onChainEvents.length > 0) {
    onChainEvents.forEach(e => {
      if (!e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower)) {
        if (["perf_instant", "perf_daily", "perf_claim"].includes(e.type)) {
          totalCandidatePerfSum += typeof e.amount === "number" ? e.amount : parseFloat(e.amount || 0);
        }
      }
    });
  }

  if (targetPerf > 0 && totalCandidatePerfSum < targetPerf - 0.01) {
    const diff = targetPerf - totalCandidatePerfSum;
    let remPerf = diff;
    let pIdx = 0;
    const maxPerPerfEntry = 5.0;
    while (remPerf > 0.001 && pIdx < 100) {
      const entryAmt = Math.min(maxPerPerfEntry, remPerf);
      candidateEvents.push({
        type: "candidate_perf_daily",
        bIdx: 0,
        day: pIdx + 31,
        dailyRate: Math.round(entryAmt * 1e8) / 1e8,
        startTime: fallbackTimeBase + 4000,
        endTime: now,
        tierIndex: 0,
        timestamp: fallbackTimeBase + 4000 + (pIdx * 10),
        sortPriority: 2,
        isFallback: true
      });
      remPerf = Math.round((remPerf - entryAmt) * 1e8) / 1e8;
      pIdx++;
    }
  }

  let candidateLevelROISum = 0;
  if (targetLevelROI > 0 && treeNodes) {
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

          // Smart contract rule: Child totalDeposits >= 50, Parent totalDeposits >= 50, Parent qualifiedDirectsCount >= foundLevel
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
          sortPriority: 2,
          txHash: `0x_gen_lvl_roi_${dc.addr.toLowerCase()}_${dayOffset}_${dc.level}`
        });
        candidateLevelROISum += dc.expectedDaily;
      }
      dayOffset++;
      iteration++;
    }

    let totalCandidateLevelROISum = candidateLevelROISum;
    if (onChainEvents && onChainEvents.length > 0) {
      onChainEvents.forEach(e => {
        if (!e.isSimulated && e.type === "level_roi" && (!e.user || e.user.toLowerCase() === userAddrLower)) {
          totalCandidateLevelROISum += typeof e.amount === "number" ? e.amount : parseFloat(e.amount || 0);
        }
      });
    }

    if (totalCandidateLevelROISum < targetLevelROI - 0.01) {
      const diff = targetLevelROI - totalCandidateLevelROISum;
      let remLvlRoi = diff;
      let roiIdx = 0;
      const maxPerLvlRoiEntry = 2.5;
      while (remLvlRoi > 0.001 && roiIdx < 100) {
        const entryAmt = Math.min(maxPerLvlRoiEntry, remLvlRoi);
        candidateEvents.push({
          type: "candidate_level_roi",
          typeName: "Level ROI Matching",
          fromUser: "Downline",
          amount: Math.round(entryAmt * 1e8) / 1e8,
          level: "1",
          timestamp: fallbackTimeBase + 2000 + (roiIdx * 10),
          sortPriority: 2,
          txHash: `0x_gen_lvl_roi_unbundled_${regTime}_${roiIdx}`
        });
        remLvlRoi = Math.round((remLvlRoi - entryAmt) * 1e8) / 1e8;
        roiIdx++;
      }
    }
  }

  if (onChainEvents && onChainEvents.length > 0) {
    onChainEvents.forEach(e => {
      if (!e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower)) {
        let incType = e.type;
        if (["perf_claim", "perf_instant", "perf_daily"].includes(e.type)) incType = "perf_daily";
        candidateEvents.push({
          type: "on_chain_income",
          incomeType: incType,
          amount: typeof e.amount === "number" ? e.amount : parseFloat(e.amount || 0),
          timestamp: e.timestamp || regTime,
          sortPriority: 1.5,
          tierIndex: e.tierIndex
        });
      }
    });
  }

  candidateEvents.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.sortPriority - b.sortPriority;
  });

  let currentDeposit = 0;
  let accumulatedDailyROI = 0;
  let accumulatedBoosterROI = 0;
  let accumulatedLevelIncome = 0;
  let accumulatedLevelROI = 0;
  let accumulatedPerf = 0;
  let cumulativeTotalEarned = 0;

  let lastUpdateROI = regTime;
  let lastUpdateBooster = regTime;
  let lastUpdatePerf = 0;

  const generated = [];
  const depositROIEarnedMap = {};
  const depositTotalEarnedMap = {};
  const tierPerfEarnedMap = {};

  for (const evt of candidateEvents) {
    if (evt.type === "user_deposit") {
      currentDeposit += evt.amount;
      continue;
    }

    if (evt.type === "on_chain_income") {
      const maxNetNow = currentDeposit * 4.0;
      const remNetNow = Math.max(0, maxNetNow - cumulativeTotalEarned);
      const amt = Math.min(evt.amount, remNetNow);
      if (amt > 0) {
        cumulativeTotalEarned += amt;
        if (evt.incomeType === "level_income") accumulatedLevelIncome += amt;
        else if (evt.incomeType === "level_roi") accumulatedLevelROI += amt;
        else if (evt.incomeType === "perf_daily") {
          accumulatedPerf += amt;
          const tIdx = evt.tierIndex !== undefined && evt.tierIndex !== null ? Number(evt.tierIndex) : 0;
          tierPerfEarnedMap[tIdx] = (tierPerfEarnedMap[tIdx] || 0) + amt;
        } else if (evt.incomeType === "roi") {
          accumulatedDailyROI += amt;
        } else if (evt.incomeType === "booster_roi") {
          accumulatedBoosterROI += amt;
        }
      }
      continue;
    }

    const maxRoiCap = currentDeposit * 2.2;
    const maxNetworkCap = currentDeposit * 4.0;

    const remRoiCap = Math.max(0, maxRoiCap - (accumulatedDailyROI + accumulatedBoosterROI));
    const remNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);

    if (evt.type === "candidate_level_income") {
      if (targetLevelIncome > 0 && accumulatedLevelIncome >= targetLevelIncome - 0.001) continue;

      let amt = evt.amount;
      if (targetLevelIncome > 0 && accumulatedLevelIncome + amt > targetLevelIncome) {
        amt = targetLevelIncome - accumulatedLevelIncome;
      }
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
        sortedDeposits.forEach((dep, depIdx) => {
          if (evt.timestamp >= dep.timestamp) {
            depositTotalEarnedMap[depIdx] = (depositTotalEarnedMap[depIdx] || 0) + amt;
          }
        });
      }
      continue;
    }

    if (evt.type === "candidate_level_roi") {
      if (targetLevelROI > 0 && accumulatedLevelROI >= targetLevelROI - 0.001) continue;

      let amt = evt.amount;
      if (targetLevelROI > 0 && accumulatedLevelROI + amt > targetLevelROI) {
        amt = targetLevelROI - accumulatedLevelROI;
      }
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
        sortedDeposits.forEach((dep, depIdx) => {
          if (evt.timestamp >= dep.timestamp) {
            depositTotalEarnedMap[depIdx] = (depositTotalEarnedMap[depIdx] || 0) + amt;
          }
        });
      }
      continue;
    }

    if (evt.type === "candidate_roi") {
      const depIdx = evt.depIdx;
      const depAmount = evt.depAmount;
      const depCumAmount = sortedDeposits.slice(0, depIdx + 1).reduce((sum, d) => sum + d.amount, 0);
      const depMaxCap = depCumAmount * 2.2;
      const activeTotalDeposit = sortedDeposits.filter(d => d.timestamp <= evt.timestamp).reduce((sum, d) => sum + d.amount, 0);
      const maxNetworkCapNow = activeTotalDeposit * 4.0;

      const hasAnchoredEvt = generated.some(g => 
        g.type === "roi" && 
        g.txHash && g.txHash.includes(`_dep${depIdx}`) &&
        Math.abs(g.timestamp - evt.timestamp) < 300
      );

      if (hasAnchoredEvt) {
        continue;
      }

      if (cumulativeTotalEarned < depMaxCap - 0.0001 && cumulativeTotalEarned < maxNetworkCapNow - 0.0001) {
        // Booster ROI applies ONLY to First Deposit (evt.isFirstDeposit / depIdx === 0)
        const rateBps = evt.isFirstDeposit ? getBoosterRateAtTime(evt.timestamp) : 50;

        const isFutureRoi = evt.timestamp > lastUpdateROI;
        if (isFutureRoi || targetDailyROI === 0 || accumulatedDailyROI < targetDailyROI - 0.0001) {
          let roiAmt = (depAmount * rateBps) / 10000;
          if (!isFutureRoi && targetDailyROI > 0 && accumulatedDailyROI + roiAmt > targetDailyROI) {
            roiAmt = targetDailyROI - accumulatedDailyROI;
          }
          const curRemDepCap = Math.max(0, depMaxCap - cumulativeTotalEarned);
          const curRemNetCap = Math.max(0, maxNetworkCapNow - cumulativeTotalEarned);
          roiAmt = Math.min(roiAmt, curRemDepCap, curRemNetCap);
          roiAmt = Math.round(roiAmt * 1e8) / 1e8;

          if (roiAmt > 0) {
            generated.push({
              type: "roi",
              typeName: "Daily ROI Payout",
              fromUser: "Contract",
              amount: roiAmt,
              level: "-",
              timestamp: evt.timestamp,
              status: "Completed",
              txHash: `0x_gen_roi_${regTime}_dep${depIdx}_${evt.day}`,
              blockNumber: 0
            });
            depositROIEarnedMap[depIdx] = (depositROIEarnedMap[depIdx] || 0) + roiAmt;
            sortedDeposits.forEach((dep, dIdx) => {
              if (evt.timestamp >= dep.timestamp) {
                depositTotalEarnedMap[dIdx] = (depositTotalEarnedMap[dIdx] || 0) + roiAmt;
              }
            });
            accumulatedDailyROI += roiAmt;
            cumulativeTotalEarned += roiAmt;
          }
        }
      }
      continue;
    }

    if (evt.type === "candidate_perf_daily") {
      const tIdx = evt.tierIndex !== undefined ? Number(evt.tierIndex) : 0;
      const tierMaxAllowed = evt.isFallback ? targetPerf : 30 * evt.dailyRate;
      const tierEarned = tierPerfEarnedMap[tIdx] || 0;
      if (tierEarned >= tierMaxAllowed - 0.001) continue;

      const hasAnchoredEvt = generated.some(g => 
        g.type === "perf_daily" && 
        Math.abs(g.timestamp - evt.timestamp) < 200
      );
      if (hasAnchoredEvt) continue;

      if (evt.timestamp > now) continue;
      if (targetPerf > 0 && accumulatedPerf >= targetPerf - 0.001) continue;

      let amt = evt.dailyRate;
      const remTierCap = Math.max(0, tierMaxAllowed - tierEarned);
      if (amt > remTierCap) amt = remTierCap;

      if (targetPerf > 0 && accumulatedPerf + amt > targetPerf) {
        amt = targetPerf - accumulatedPerf;
      }

      const curRemNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);
      amt = Math.min(amt, curRemNetCap);
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
        tierPerfEarnedMap[tIdx] = (tierPerfEarnedMap[tIdx] || 0) + amt;
        accumulatedPerf += amt;
        cumulativeTotalEarned += amt;
      }
      continue;
    }
  }



  return generated;
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
