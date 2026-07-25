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
                      type: "level_income",
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

  if (targetLevelIncome > 0 && candidateLevelIncSum < targetLevelIncome - 0.01) {
    const diff = targetLevelIncome - candidateLevelIncSum;
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
        type: "level_income",
        typeName: "Level Income",
        fromUser: fallbackL1Addr,
        amount: Math.round(entryAmt * 1e8) / 1e8,
        level: "1",
        timestamp: regTime + 480 + (incIdx * 10),
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
    const uniqueBonuses = [];
    localActiveBonuses.forEach(b => {
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

    let remainingPerfAmount = Math.max(0, totalMaxAllowedPerf - realPerfSumOnChain);
    let simulatedCandidatePerfSum = 0;

    uniqueBonuses.forEach((bonus, bIdx) => {
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
          type: "level_roi",
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

    if (candidateLevelROISum < targetLevelROI - 0.01) {
      const diff = targetLevelROI - candidateLevelROISum;
      let remLvlRoi = diff;
      let roiIdx = 0;
      const maxPerLvlRoiEntry = 2.5;
      while (remLvlRoi > 0.001 && roiIdx < 100) {
        const entryAmt = Math.min(maxPerLvlRoiEntry, remLvlRoi);
        candidateEvents.push({
          type: "level_roi",
          typeName: "Level ROI Matching",
          fromUser: "Downline",
          amount: Math.round(entryAmt * 1e8) / 1e8,
          level: "1",
          timestamp: regTime + 1080 + (roiIdx * 10),
          sortPriority: 2,
          txHash: `0x_gen_lvl_roi_unbundled_${regTime}_${roiIdx}`
        });
        remLvlRoi = Math.round((remLvlRoi - entryAmt) * 1e8) / 1e8;
        roiIdx++;
      }
    }
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


  if (onChainEvents && onChainEvents.length > 0) {
    onChainEvents.forEach(e => {
      if (!e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower)) {
        if (e.type === "level_income") {
          accumulatedLevelIncome += e.amount;
          cumulativeTotalEarned += e.amount;
        } else if (e.type === "level_roi") {
          accumulatedLevelROI += e.amount;
          cumulativeTotalEarned += e.amount;
        } else if (e.type === "perf_claim" || e.type === "perf_instant") {
          accumulatedPerf += e.amount;
          cumulativeTotalEarned += e.amount;
        }
      }
    });

    const realRoiEvents = onChainEvents
      .filter(e => e.type === "roi" && !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower))
      .sort((a, b) => a.timestamp - b.timestamp);

    const depLastUpdateRoiMap = {};
    sortedDeposits.forEach((d, idx) => {
      depLastUpdateRoiMap[idx] = d.timestamp;
    });

    realRoiEvents.forEach((e, idx) => {
      const activeDeps = sortedDeposits.filter(d => d.timestamp <= e.timestamp);

      if (activeDeps.length > 0) {
        activeDeps.forEach((dep, depIdx) => {
          const lastTime = depLastUpdateRoiMap[depIdx] || dep.timestamp;
          const timeDiff = e.timestamp - lastTime;
          const numDays = Math.floor(timeDiff / ONE_DAY_SECS);
          if (numDays > 0) {
            for (let i = 1; i <= numDays; i++) {
              const payoutTime = lastTime + i * ONE_DAY_SECS;
              const rateBps = depIdx === 0 ? getBoosterRateAtTime(payoutTime) : 50;
              const intervalAmt = Math.round(((dep.amount * rateBps) / 10000) * 1e8) / 1e8;

              generated.push({
                type: "roi",
                typeName: "Daily ROI Payout",
                fromUser: "Contract",
                amount: intervalAmt,
                level: "-",
                timestamp: payoutTime,
                status: "Completed",
                txHash: `0x_gen_roi_${regTime}_anchored_${idx}_${i}_dep${depIdx}`,
                blockNumber: 0
              });
            }
            depLastUpdateRoiMap[depIdx] = lastTime + numDays * ONE_DAY_SECS;
          }
        });
      }
      accumulatedDailyROI += e.amount;
      cumulativeTotalEarned += e.amount;
    });

    const realBoosterEvents = onChainEvents
      .filter(e => e.type === "booster_roi" && !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower))
      .sort((a, b) => a.timestamp - b.timestamp);

    realBoosterEvents.forEach((e, idx) => {
      accumulatedBoosterROI += e.amount;
      cumulativeTotalEarned += e.amount;
    });

    const realPerfEvents = onChainEvents
      .filter(e => e.type === "perf_daily" && !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (localActiveBonuses && localActiveBonuses.length > 0) {
      lastUpdatePerf = Math.max(regTime, localActiveBonuses[0].startTime);
    } else if (realPerfEvents.length > 0) {
      const firstEvtTime = realPerfEvents[0].timestamp;
      lastUpdatePerf = Math.max(regTime, firstEvtTime - PERF_ONE_DAY_SECS);
    } else {
      lastUpdatePerf = regTime;
    }

    realPerfEvents.forEach((e, idx) => {
      let dailyRate = 5;
      if (localActiveBonuses && localActiveBonuses.length > 0) {
        const match = localActiveBonuses.find(b => b.tierIndex === e.tierIndex) || localActiveBonuses[0];
        dailyRate = match.dailyRate;
      }
      const numPayouts = Math.round(e.amount / dailyRate);
      if (numPayouts > 0) {
        const startTimeForChunk = e.timestamp - (numPayouts - 1) * PERF_ONE_DAY_SECS;
        for (let i = 0; i < numPayouts; i++) {
          const payoutTime = startTimeForChunk + i * PERF_ONE_DAY_SECS;
          if (payoutTime <= now && payoutTime >= regTime) {
            generated.push({
              type: "perf_daily",
              typeName: "Performance Daily Salary",
              fromUser: "Contract",
              amount: dailyRate,
              level: "-",
              timestamp: payoutTime,
              status: "Completed",
              txHash: `0x_gen_perf_${e.timestamp}_anchored_${idx}_${i}`,
              blockNumber: 0
            });
          }
        }
        accumulatedPerf += e.amount;
        cumulativeTotalEarned += e.amount;
        lastUpdatePerf = Math.max(lastUpdatePerf, startTimeForChunk + numPayouts * PERF_ONE_DAY_SECS);
      }
    });
  }

  const depositROIEarnedMap = {};
  const depositTotalEarnedMap = {};

  if (onChainEvents && onChainEvents.length > 0) {
    onChainEvents.forEach(e => {
      if (!e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower)) {
        if (["level_income", "level_roi", "perf_claim", "perf_instant", "perf_daily", "roi", "booster_roi"].includes(e.type)) {
          sortedDeposits.forEach((dep, depIdx) => {
            if (e.timestamp >= dep.timestamp) {
              depositTotalEarnedMap[depIdx] = (depositTotalEarnedMap[depIdx] || 0) + e.amount;
            }
          });
        }
      }
    });
  }

  generated.forEach(e => {
    sortedDeposits.forEach((dep, depIdx) => {
      if (e.timestamp >= dep.timestamp) {
        depositTotalEarnedMap[depIdx] = (depositTotalEarnedMap[depIdx] || 0) + e.amount;
      }
    });
    if (e.type === "roi" && e.txHash) {
      const match = e.txHash.match(/dep(\d+)/);
      if (match) {
        const depIdx = Number(match[1]);
        depositROIEarnedMap[depIdx] = (depositROIEarnedMap[depIdx] || 0) + e.amount;
      }
    }
  });

  for (const evt of candidateEvents) {
    if (evt.type === "user_deposit") {
      currentDeposit += evt.amount;
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
      const depMaxCap = depAmount * 2.2;
      const depCurrentEarned = depositTotalEarnedMap[depIdx] || 0;

      const hasAnchoredEvt = generated.some(g => 
        g.type === "roi" && 
        g.txHash && g.txHash.includes(`_dep${depIdx}`) &&
        Math.abs(g.timestamp - evt.timestamp) < 300
      );

      if (hasAnchoredEvt) {
        continue;
      }

      if (depCurrentEarned < depMaxCap - 0.0001) {
        // Booster ROI applies ONLY to First Deposit (evt.isFirstDeposit / depIdx === 0)
        const rateBps = evt.isFirstDeposit ? getBoosterRateAtTime(evt.timestamp) : 50;

        const isFutureRoi = evt.timestamp > lastUpdateROI;
        if (isFutureRoi || targetDailyROI === 0 || accumulatedDailyROI < targetDailyROI - 0.0001) {
          let roiAmt = (depAmount * rateBps) / 10000;
          if (!isFutureRoi && targetDailyROI > 0 && accumulatedDailyROI + roiAmt > targetDailyROI) {
            roiAmt = targetDailyROI - accumulatedDailyROI;
          }
          const curRemDepCap = Math.max(0, depMaxCap - depCurrentEarned);
          const curRemRoiCap = Math.max(0, maxRoiCap - cumulativeTotalEarned);
          const curRemNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);
          roiAmt = Math.min(roiAmt, curRemDepCap, curRemRoiCap, curRemNetCap);
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
      const hasAnchoredEvt = generated.some(g => 
        g.type === "perf_daily" && 
        Math.abs(g.timestamp - evt.timestamp) < 200
      );
      if (hasAnchoredEvt) continue;

      if (evt.timestamp > now) continue;
      if (targetPerf > 0 && accumulatedPerf >= targetPerf - 0.001) continue;

      let amt = evt.dailyRate;
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
