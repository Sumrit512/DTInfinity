import { ethers } from "ethers";
import { PERFORMANCE_TIERS } from "../constants/abis.js";
import { safeFloat } from "./formatters.js";

// Keep exactly as before
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

export function generatePerformanceSalaryStream(stream, PERF_ONE_DAY_SECS, maxCapLimit = 30 * (stream.dailyRate || 5), targetPerfLimit = 0, sourceName = "simulation") {
  const installments = [];
  const streamStart = Number(stream.startTime);
  const dailyRate = Number(stream.dailyRate);
  const tierIndex = stream.tierIndex !== undefined ? Number(stream.tierIndex) : 0;
  const streamId = stream.streamId || `${tierIndex}_${streamStart}`;

  let accumulated = 0;
  for (let day = 1; day <= 30; day++) {
    const salaryTime = streamStart + day * PERF_ONE_DAY_SECS;
    if (accumulated + dailyRate > maxCapLimit + 0.001) break;
    if (targetPerfLimit > 0 && accumulated + dailyRate > targetPerfLimit + 0.001) break;

    installments.push({
      type: "perf_daily",
      streamId: streamId,
      day: day,
      dailyRate: dailyRate,
      startTime: streamStart,
      endTime: streamStart + 30 * PERF_ONE_DAY_SECS,
      tierIndex: tierIndex,
      timestamp: salaryTime
    });
    accumulated += dailyRate;
  }
  return installments;
}

export function generateSimulatedLedger(addr, basicInfo, incomeInfo, directs, currentOneDayVal, loadedDirectsMap = {}, userDeposits = [], currentPerfOneDayVal, activeBonuses = []) {
  const sponsorJoin = Number(basicInfo?.registrationTime || 0);
  const PERF_ONE_DAY_SECS = Number(currentPerfOneDayVal);
  const now = Math.floor(Date.now() / 1000);

  const sponsorDeposit = basicInfo && basicInfo.totalDeposits !== undefined && basicInfo.totalDeposits !== null
    ? (typeof basicInfo.totalDeposits === "bigint" ? safeFloat(ethers.formatUnits(basicInfo.totalDeposits, 18)) : parseFloat(basicInfo.totalDeposits || 0))
    : 0;

  if (!basicInfo || Number(basicInfo.registrationTime) === 0 || basicInfo.totalDeposits === 0n) return [];

  const totalEarnedSoFar = incomeInfo ? (
    safeFloat(ethers.formatUnits(incomeInfo.dailyROIEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.roiBoosterEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.levelIncomeEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.levelROIEarned || 0n, 18)) +
    safeFloat(ethers.formatUnits(incomeInfo.performanceBonusEarned || 0n, 18))
  ) : 0;

  const maxNetCap = sponsorDeposit * 4.0;
  if (totalEarnedSoFar >= maxNetCap) return [];

  const list = [];
  activeBonuses.forEach((bonus) => {
    const installments = generatePerformanceSalaryStream(bonus, PERF_ONE_DAY_SECS, 30 * (bonus.dailyRate || 5), 0, "generateSimulatedLedger");
    installments.forEach(inst => {
      if (inst.timestamp <= now) {
        list.push({
          type: "perf_daily",
          typeName: "Performance Daily Salary",
          fromUser: "Contract",
          amount: inst.dailyRate,
          level: "-",
          timestamp: inst.timestamp,
          status: "Completed",
          txHash: `0x_salary_${inst.streamId}_${inst.day}`,
          blockNumber: 0,
          isSimulated: true
        });
      }
    });
  });
  return list;
}

// ============================================================================
// CORE SIMULATION REWRITE - DETERMINISTIC STATE MACHINE
// ============================================================================

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
  onChainEvents = [],
  lastUpdateROIVal = 0,
  settledDailyROIVal = 0,
  settledBoosterROIVal = 0
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

  const ONE_DAY_SECS = Number(oneDayVal);
  const PERF_ONE_DAY_SECS = Number(perfOneDayVal);
  const now = Math.floor(Date.now() / 1000);
  const userAddrLower = addr ? addr.toLowerCase() : "";

  // Target Values for Validation
  const targetDailyROI = parseFloat(dailyROIEarned) || 0;
  const targetBoosterROI = parseFloat(roiBoosterEarned) || 0;
  const targetLevelIncome = parseFloat(levelIncomeEarned) || 0;
  const targetLevelROI = parseFloat(levelROIEarned) || 0;
  const targetPerf = parseFloat(performanceBonusEarned) || 0;

  // Internal State
  let currentDeposit = 0;
  let cumulativeTotalEarned = 0;
  let accumulatedDailyROI = 0;
  let accumulatedBoosterROI = 0;
  let accumulatedLevelIncome = 0;
  let accumulatedLevelROI = 0;
  let accumulatedPerf = 0;

  const activeDepositsList = [];
  const activeBonusesList = [];
  const ledger = [];
  const replayLogs = [];
  const validationErrors = [];

  // Parse direct referrals for booster calculations
  const directsData = [];
  if (treeNodes) {
    const sponsorNode = treeNodes[userAddrLower];
    const directAddrs = sponsorNode?.children || [];
    directAddrs.forEach(childAddr => {
      const childNode = treeNodes[childAddr.toLowerCase()];
      if (childNode) {
        directsData.push({
          address: childAddr,
          registrationTime: Number(childNode.registrationTime || 0),
          totalDeposits: parseFloat(childNode.totalDeposits || 0)
        });
      }
    });
  }

  // Extract Real Blockchain Events
  const rawRealEvents = [];
  const validOnChain = (onChainEvents || []).filter(e => !e.isSimulated && (!e.user || e.user.toLowerCase() === userAddrLower));

  // Performance Bonus Replay Engine (Record-Driven Engine)
  const processedPerformanceBonusRecords = new Set();

  // Sort records chronologically
  const sortedPerformanceRecords = [...(activeBonuses || [])].sort((a, b) => {
    const tA = Number(a.startTime || a.monthId || a.qualificationTimestamp || 0);
    const tB = Number(b.startTime || b.monthId || b.qualificationTimestamp || 0);
    return tA - tB;
  });

  sortedPerformanceRecords.forEach(b => {
    const recId = Number(b.recordId || 0);
    const startT = Number(b.startTime || b.monthId || b.qualificationTimestamp || 0);
    const tierIdx = b.tierIndex !== undefined ? Number(b.tierIndex) : 0;

    if (b.isCappedAtStart && Number(b.status || 0) === 0) {
      return; // Skip generating simulated daily salary for forfeited records
    }

    if (recId > 0) {
      if (processedPerformanceBonusRecords.has(recId)) {
        return; // Process each unique Record ID exactly once
      }
      processedPerformanceBonusRecords.add(recId);
    } else {
      // Fallback for records lacking an explicit recordId
      const exists = activeBonusesList.some(existing => existing.tierIndex === tierIdx && Math.abs(existing.startTime - startT) < 300) ||
        rawRealEvents.some(ev => (ev.type === "perf_instant" || ev.type === "perf_claim") && ev.tierIndex === tierIdx && Math.abs(ev.timestamp - startT) < 300);
      if (exists) return;
    }

    const isInstant = (
      b.status === 1 ||
      b.activationType === 1 ||
      b.activationType === 4 ||
      b.chooseInstant === true ||
      (Number(b.status || 0) === 0 && now >= startT + PERF_ONE_DAY_SECS)
    );

    if (isInstant) {
      // Option A: Generate EXACTLY ONE ledger entry at the record's start/activation timestamp.
      const instantAmt = b.instantAmount || PERFORMANCE_TIERS[tierIdx]?.instant || 75;
      const isAuto = b.activationType === 4 || (Number(b.status || 0) === 0 && now >= startT + PERF_ONE_DAY_SECS);
      const eventTimestamp = isAuto
        ? (Number(b.activatedTimestamp || startT + PERF_ONE_DAY_SECS))
        : (Number(b.activatedTimestamp || startT));

      rawRealEvents.push({
        type: "perf_instant",
        typeName: isAuto ? "Performance Bonus (Auto-Instant)" : "Performance Bonus (Instant)",
        fromUser: "Contract",
        amount: instantAmt,
        tierIndex: tierIdx,
        level: "-",
        timestamp: eventTimestamp,
        status: "Completed",
        txHash: `0x_record_instant_${recId || tierIdx}_${startT}`,
        blockNumber: 0,
        recordId: recId,
        isSimulated: true
      });
    } else {
      // Option B: Generate 30-day salary stream beginning at the record's start timestamp.
      const endT = b.endTime !== undefined ? Number(b.endTime) : startT + 30 * PERF_ONE_DAY_SECS;
      const lastClaimT = b.lastClaimTime !== undefined ? Number(b.lastClaimTime) : startT;
      const streamId = recId > 0 ? `rec_${recId}` : `${tierIdx}_${startT}`;
      const dailyRateVal = b.dailyRate || PERFORMANCE_TIERS[tierIdx]?.daily || 5;

      const isCompletedHistorical = (b.status === 4 || b.completed === true || Number(b.daysPaid || 0) >= 30);

      if (isCompletedHistorical) {
        let accumulatedRecordAmt = 0;
        const maxRecordAmt = b.amountPaid !== undefined && Number(b.amountPaid) > 0 ? Number(b.amountPaid) : 30 * dailyRateVal;
        for (let day = 1; day <= 30; day++) {
          if (accumulatedRecordAmt >= maxRecordAmt - 0.0001) break;
          let dayAmt = Math.min(dailyRateVal, maxRecordAmt - accumulatedRecordAmt);
          dayAmt = Math.round(dayAmt * 1e8) / 1e8;
          accumulatedRecordAmt += dayAmt;

          const tickTime = startT + day * PERF_ONE_DAY_SECS;
          rawRealEvents.push({
            type: "perf_daily",
            typeName: "Performance Daily Salary",
            fromUser: "Contract",
            amount: dayAmt,
            tierIndex: tierIdx,
            level: "-",
            timestamp: tickTime,
            status: "Completed",
            txHash: `0x_salary_${streamId}_${day}`,
            blockNumber: 0,
            recordId: recId,
            streamId: streamId
          });
        }
      } else {
        activeBonusesList.push({
          streamId: streamId,
          recordId: recId,
          tierIndex: tierIdx,
          dailyRate: dailyRateVal,
          startTime: startT,
          lastClaimTime: lastClaimT,
          endTime: endT,
          nextTick: startT + PERF_ONE_DAY_SECS,
          accumulatedDays: Number(b.daysPaid || 0),
          accumulatedAmount: Number(b.amountPaid || 0)
        });
      }
    }
  });

  // Gather deposits securely from userDeposits
  let allDeposits = [];
  if (userDeposits && userDeposits.length > 0) {
    allDeposits = userDeposits.map(d => ({
      type: "deposit",
      typeName: "Deposit",
      fromUser: addr,
      amount: typeof d.amount === "number" ? d.amount : parseFloat(ethers.formatUnits(d.amount || 0n, 18)),
      level: "-",
      timestamp: Number(d.time || d.timestamp || regTime),
      status: "Completed",
      txHash: d.txHash || `0x_dep_${d.timestamp || d.time || regTime}`,
      blockNumber: d.blockNumber || 0,
      originalEvent: d
    }));
  } else {
    const totDepNum = parseFloat(totalDeposits) || 0;
    if (totDepNum > 0) {
      allDeposits = [{
        type: "deposit", typeName: "Deposit", fromUser: addr, amount: totDepNum, level: "-",
        timestamp: regTime, status: "Completed", txHash: `0x_dep_${regTime}`, blockNumber: 0
      }];
    }
  }

  rawRealEvents.push(...allDeposits);

  validOnChain.forEach(e => {
    // Only accept real network state changes (Performance events originate strictly from record-driven replay)
    if (["level_income", "level_roi", "withdraw"].includes(e.type)) {
      rawRealEvents.push({
        type: e.type,
        typeName: e.typeName || e.type,
        fromUser: e.fromUser || e.user || e.from || "-",
        amount: e.amount,
        level: e.level !== undefined ? e.level : "-",
        tierIndex: e.tierIndex !== undefined ? e.tierIndex : (e.originalEvent?.tierIndex),
        dailyRate: e.dailyRate !== undefined ? e.dailyRate : (e.originalEvent?.dailyRate),
        timestamp: e.timestamp,
        status: e.status || "Completed",
        txHash: e.txHash || `0x_real_${e.timestamp}`,
        originalEvent: e
      });
    }
  });

  // Unique TxHash Filtering for Real Events (Protect against duplicates)
  const uniqueRealEvents = [];
  const seenTx = new Set();
  rawRealEvents.forEach(e => {
    const key = `${e.txHash}_${e.type}`;
    if (!seenTx.has(key)) {
      seenTx.add(key);
      uniqueRealEvents.push(e);
    }
  });

  // Sort strictly by blockNumber -> transactionIndex -> logIndex (falling back to timestamp)
  uniqueRealEvents.sort((a, b) => {
    const bNumA = Number(a.blockNumber || a.originalEvent?.blockNumber || 0);
    const bNumB = Number(b.blockNumber || b.originalEvent?.blockNumber || 0);
    if (bNumA !== bNumB && bNumA > 0 && bNumB > 0) return bNumA - bNumB;

    const txIdxA = Number(a.transactionIndex || a.originalEvent?.transactionIndex || 0);
    const txIdxB = Number(b.transactionIndex || b.originalEvent?.transactionIndex || 0);
    if (txIdxA !== txIdxB && txIdxA > 0 && txIdxB > 0) return txIdxA - txIdxB;

    const logIdxA = Number(a.logIndex || a.originalEvent?.logIndex || 0);
    const logIdxB = Number(b.logIndex || b.originalEvent?.logIndex || 0);
    if (logIdxA !== logIdxB && logIdxA > 0 && logIdxB > 0) return logIdxA - logIdxB;

    return a.timestamp - b.timestamp;
  });

  // --------------------------------------------------------------------------
  // STATE MACHINE HELPERS
  // --------------------------------------------------------------------------

  function getBoosterRateAtTime(timestamp) {
    const passedBps = Math.round((parseFloat(boosterRate) || 0.5) * 100);
    if (regTime === 0 || regTime > timestamp) return 50;

    if (directsData && directsData.length > 0) {
      let refs5 = 0, refs10 = 0, refs15 = 0, refs20 = 0, refs25 = 0;
      const sponsorFirstDeposit = activeDepositsList.length > 0
        ? activeDepositsList[0].amount
        : (parseFloat(totalDeposits) || 0);

      for (const d of directsData) {
        if (d.registrationTime > timestamp) continue;
        if (d.registrationTime > regTime + 25 * ONE_DAY_SECS) continue;

        if (sponsorFirstDeposit > 0 && d.totalDeposits >= sponsorFirstDeposit) {
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

      // Apply passedBps only for current timestamp / live view, avoiding retroactive application to historical ticks
      const nowTs = Math.floor(Date.now() / 1000);
      if (timestamp >= nowTs - 60) {
        return Math.max(calculatedRate, passedBps);
      }

      return calculatedRate;
    }

    return passedBps > 50 ? passedBps : 50;
  }

  function _calcDepositPendingROI(dep, isFirstDeposit, runningLifetimeIncome, maxNetworkCap, boosterRateAtTick) {
    if (!dep.active || dep.amount <= 0) return { pDaily: 0, pBooster: 0, usedCap: 0 };
    if (runningLifetimeIncome >= dep.packageEndIncome - 0.0001) return { pDaily: 0, pBooster: 0, usedCap: 0 };
    if (runningLifetimeIncome >= maxNetworkCap - 0.0001) return { pDaily: 0, pBooster: 0, usedCap: 0 };

    const baseRateBps = 50;
    const totalDailyAccrued = (dep.amount * baseRateBps) / 10000;

    let boosterRateBps = 0;
    if (isFirstDeposit && boosterRateAtTick > 50) {
      boosterRateBps = boosterRateAtTick - 50;
    }
    const totalBoosterAccrued = (dep.amount * boosterRateBps) / 10000;
    const totalAccrued = totalDailyAccrued + totalBoosterAccrued;

    if (totalAccrued <= 0) return { pDaily: 0, pBooster: 0, usedCap: 0 };

    const remPackageCap = Math.max(0, dep.packageEndIncome - runningLifetimeIncome);
    const remNetCap = Math.max(0, maxNetworkCap - runningLifetimeIncome);

    let allowed = totalAccrued;
    if (allowed > remPackageCap) allowed = remPackageCap;
    if (allowed > remNetCap) allowed = remNetCap;
    allowed = Math.round(allowed * 1e8) / 1e8;

    let pDaily = 0;
    let pBooster = 0;
    let usedCap = 0;

    if (allowed > 0) {
      usedCap = allowed;
      if (Math.abs(allowed - totalAccrued) < 1e-7) {
        pDaily = totalDailyAccrued;
        pBooster = totalBoosterAccrued;
      } else {
        pDaily = Math.round(((totalDailyAccrued * allowed) / totalAccrued) * 1e8) / 1e8;
        pBooster = Math.round((allowed - pDaily) * 1e8) / 1e8;
      }
    }
    return { pDaily, pBooster, usedCap };
  }

  function updateActiveDeposits() {
    activeDepositsList.forEach(dep => {
      if (dep.active && cumulativeTotalEarned >= dep.packageEndIncome - 0.0001) {
        dep.active = false;
      }
    });
  }

  function processROI(timestamp, isSimulated = false) {
    for (let i = 0; i < activeDepositsList.length; i++) {
      let dep = activeDepositsList[i];
      if (!dep.active) continue;

      if (dep.lastUpdateROI + ONE_DAY_SECS === timestamp) {
        const isFirstDeposit = (i === 0);
        let boosterRateAtTick = 50;
        if (isFirstDeposit) {
          boosterRateAtTick = Math.max(50, getBoosterRateAtTime(timestamp));
        }

        const maxNetworkCap = currentDeposit * 4.0;
        const res = _calcDepositPendingROI(dep, isFirstDeposit, cumulativeTotalEarned, maxNetworkCap, boosterRateAtTick);

        if (res.usedCap > 0) {
          dep.lastUpdateROI = timestamp;
          dep.dailyEarned += res.pDaily;
          dep.boosterEarned += res.pBooster;
          cumulativeTotalEarned += res.usedCap;

          if (res.pDaily > 0) {
            accumulatedDailyROI += res.pDaily;

            ledger.push({
              type: "roi",
              typeName: "Daily ROI Payout",
              fromUser: "Contract",
              amount: res.pDaily,
              level: "-",
              timestamp: timestamp,
              status: "Completed",
              txHash: `0x_gen_roi_${dep.timestamp}_dep${i}_${timestamp}`,
              blockNumber: 0,
              isSimulated: isSimulated
            });
          }

          if (res.pBooster > 0) {
            accumulatedBoosterROI += res.pBooster;

            ledger.push({
              type: "booster_roi",
              typeName: "Booster ROI Yield",
              fromUser: "Contract",
              amount: res.pBooster,
              level: "-",
              timestamp: timestamp,
              status: "Completed",
              txHash: `0x_gen_booster_${dep.timestamp}_dep${i}_${timestamp}`,
              blockNumber: 0,
              isSimulated: isSimulated
            });
          }
          updateActiveDeposits();

          replayLogs.push({
            timestamp: timestamp,
            event: "ROI Accrued",
            runningLifetimeIncome: cumulativeTotalEarned,
            networkCap: maxNetworkCap,
            packageCap: dep.packageEndIncome,
            dailyROI: res.pDaily,
            boosterROI: res.pBooster,
            reason: "Generated"
          });
        } else {
          dep.lastUpdateROI = timestamp;
          updateActiveDeposits();
        }
      }
    }
  }

  function processPerformance(timestamp, bonus, isSimulated = false) {
    if (bonus.accumulatedDays >= 30) return;
    if (bonus.accumulatedAmount >= 30 * bonus.dailyRate - 0.0001) return;

    const maxNetworkCap = currentDeposit * 4.0;
    if (cumulativeTotalEarned >= maxNetworkCap - 0.0001) return;

    let amt = bonus.dailyRate;
    const remStreamCap = Math.max(0, (30 * bonus.dailyRate) - bonus.accumulatedAmount);
    amt = Math.min(amt, remStreamCap);

    const remNetCap = Math.max(0, maxNetworkCap - cumulativeTotalEarned);
    amt = Math.min(amt, remNetCap);
    amt = Math.round(amt * 1e8) / 1e8;

    if (amt > 0) {
      bonus.accumulatedAmount += amt;
      bonus.accumulatedDays += 1;
      bonus.nextTick = timestamp + PERF_ONE_DAY_SECS;
      bonus.lastClaimTime = timestamp;
      cumulativeTotalEarned += amt;
      accumulatedPerf += amt;

      ledger.push({
        type: "perf_daily",
        typeName: "Performance Daily Salary",
        fromUser: "Contract",
        amount: amt,
        level: "-",
        timestamp: timestamp,
        status: "Completed",
        txHash: `0x_salary_${bonus.streamId}_${bonus.accumulatedDays}`,
        blockNumber: 0,
        recordId: bonus.recordId,
        streamId: bonus.streamId,
        isSimulated: isSimulated
      });
      updateActiveDeposits();
    } else {
      bonus.nextTick = timestamp + PERF_ONE_DAY_SECS;
    }
  }

  function simulateElapsedTime(start, end, isPending = false) {
    let currentTime = start;
    let iterations = 0;
    const maxIterations = 5000;
    while (true) {
      iterations++;
      if (iterations > maxIterations) {
        console.warn("simulateElapsedTime safety iteration limit reached, breaking loop.");
        break;
      }
      let nextTick = end + 1;
      let tickType = null;
      let tickData = null;

      // Find closest ROI tick
      for (const dep of activeDepositsList) {
        if (!dep.active) continue;
        let depNextTick = dep.lastUpdateROI + ONE_DAY_SECS;
        if (depNextTick <= end && depNextTick < nextTick) {
          nextTick = depNextTick;
          tickType = 'ROI';
        }
      }

      // Find closest Performance tick
      for (const bonus of activeBonusesList) {
        if (bonus.accumulatedDays >= 30) continue;
        if (bonus.nextTick <= end && bonus.nextTick <= nextTick) {
          nextTick = bonus.nextTick;
          tickType = 'PERFORMANCE';
          tickData = bonus;
        }
      }

      if (nextTick > end) {
        break;
      }

      if (nextTick <= currentTime) {
        if (tickType === 'PERFORMANCE' && tickData) {
          tickData.nextTick = currentTime + PERF_ONE_DAY_SECS;
        } else if (tickType === 'ROI') {
          for (const dep of activeDepositsList) {
            if (dep.active && dep.lastUpdateROI + ONE_DAY_SECS <= currentTime) {
              dep.lastUpdateROI = currentTime;
            }
          }
        }
        continue;
      }

      currentTime = nextTick;

      if (tickType === 'ROI') {
        processROI(currentTime, isPending);
      } else if (tickType === 'PERFORMANCE') {
        processPerformance(currentTime, tickData, isPending);
      }
    }
  }

  function replaySolidityTransaction(evt) {
    if (evt.type === 'deposit') {
      currentDeposit += evt.amount;
      const orig = evt.originalEvent;
      const packageStartIncome = (orig && orig.packageStartIncome !== undefined)
        ? Number(orig.packageStartIncome)
        : cumulativeTotalEarned;
      const packageEndIncome = (orig && orig.packageEndIncome !== undefined)
        ? Number(orig.packageEndIncome)
        : (cumulativeTotalEarned + evt.amount * 2.2);

      const isActiveOnChain = (orig && orig.active !== undefined) ? Boolean(orig.active) : true;

      activeDepositsList.push({
        index: activeDepositsList.length,
        amount: evt.amount,
        timestamp: evt.timestamp,
        lastUpdateROI: evt.timestamp,
        dailyEarned: 0,
        boosterEarned: 0,
        packageStartIncome: packageStartIncome,
        packageEndIncome: packageEndIncome,
        active: isActiveOnChain,
        txHash: evt.txHash
      });
      updateActiveDeposits();
      ledger.push(evt);
    }
    else if (evt.type === 'withdraw') {
      ledger.push(evt);
    }
    else if (evt.type === 'perf_claim') {
      ledger.push(evt);
    }
    else {
      // level_income, level_roi, perf_instant, roi, booster_roi
      const amt = evt.amount;
      if (amt > 0) {
        cumulativeTotalEarned += amt;
        if (evt.type === 'level_income') accumulatedLevelIncome += amt;
        else if (evt.type === 'level_roi') accumulatedLevelROI += amt;
        else if (evt.type === 'roi') accumulatedDailyROI += amt;
        else if (evt.type === 'booster_roi') accumulatedBoosterROI += amt;
        else accumulatedPerf += amt;

        updateActiveDeposits();
        ledger.push(evt);
      }
    }

    replayLogs.push({
      timestamp: evt.timestamp,
      event: evt.type,
      runningLifetimeIncome: cumulativeTotalEarned,
      networkCap: currentDeposit * 4.0,
      packageCap: activeDepositsList.length > 0 ? activeDepositsList[activeDepositsList.length - 1].packageEndIncome : 0,
      dailyROI: 0,
      boosterROI: 0,
      reason: "Real Transaction"
    });
  }

  // --------------------------------------------------------------------------
  // MAIN REPLAY ENGINE LOOP (PURE DETERMINISTIC EVENT SOURCING)
  // --------------------------------------------------------------------------

  // 2. PERFORMANCE REPLAY START
  console.log("PERFORMANCE REPLAY START");
  console.log("Replay Source:", activeBonuses && activeBonuses.length > 0 ? (activeBonuses[0].fromRecords ? "PerformanceBonusRecords" : "ActiveBonuses") : "Fallback");
  console.log("Stream Count:", (activeBonuses || []).length);

  let previousTime = regTime;
  let adjustmentApplied = false;

  function runSimulationSlice(start, end, isSimulated) {
    if (end > start) {
      if (!adjustmentApplied && lastUpdateROIVal > 0 && start < lastUpdateROIVal && end >= lastUpdateROIVal) {
        simulateElapsedTime(start, lastUpdateROIVal, isSimulated);
        
        const diffDaily = settledDailyROIVal - accumulatedDailyROI;
        const diffBooster = settledBoosterROIVal - accumulatedBoosterROI;
        
        if (Math.abs(diffDaily) > 0.0001) {
          const amt = Math.round(diffDaily * 1e8) / 1e8;
          accumulatedDailyROI += amt;
          cumulativeTotalEarned += amt;
          ledger.push({
            type: "roi",
            typeName: "Daily ROI Adjustment",
            fromUser: "Contract",
            amount: amt,
            level: "-",
            timestamp: lastUpdateROIVal,
            status: "Completed",
            txHash: `0x_roi_adj_${lastUpdateROIVal}`,
            blockNumber: 0,
            isSimulated: false
          });
        }
        if (Math.abs(diffBooster) > 0.0001) {
          const amt = Math.round(diffBooster * 1e8) / 1e8;
          accumulatedBoosterROI += amt;
          cumulativeTotalEarned += amt;
          ledger.push({
            type: "booster_roi",
            typeName: "Booster ROI Adjustment",
            fromUser: "Contract",
            amount: amt,
            level: "-",
            timestamp: lastUpdateROIVal,
            status: "Completed",
            txHash: `0x_booster_adj_${lastUpdateROIVal}`,
            blockNumber: 0,
            isSimulated: false
          });
        }
        
        adjustmentApplied = true;
        simulateElapsedTime(lastUpdateROIVal, end, isSimulated);
      } else {
        simulateElapsedTime(start, end, isSimulated);
      }
    }
  }

  for (const event of uniqueRealEvents) {
    if (event.timestamp > previousTime) {
      runSimulationSlice(previousTime, event.timestamp, false);
    }
    replaySolidityTransaction(event);
    previousTime = Math.max(previousTime, event.timestamp);
  }

  if (!adjustmentApplied && lastUpdateROIVal > 0) {
    runSimulationSlice(previousTime, lastUpdateROIVal, true);
    previousTime = lastUpdateROIVal;
  }

  runSimulationSlice(previousTime, now, true);

  // --------------------------------------------------------------------------
  // STORAGE-BACKED PERFORMANCE BONUS UNIFIED RECORD INGESTION & FALLBACK
  // --------------------------------------------------------------------------
  const existingPerfEntries = ledger.filter(e =>
    e.type === "perf_instant" ||
    e.type === "perf_claim" ||
    e.type === "perf_daily" ||
    e.type === "perf_fallback"
  );

  let fallbackExecuted = false;
  if (existingPerfEntries.length === 0 && targetPerf > 0) {
    fallbackExecuted = true;
    console.log("⚡ PERFORMANCE FALLBACK DAILY STREAMS GENERATED");

    let fallbackTimestamp = regTime > 0 ? regTime + PERF_ONE_DAY_SECS : now - 30 * PERF_ONE_DAY_SECS;
    if (activeBonuses && activeBonuses.length > 0) {
      fallbackTimestamp = Number(activeBonuses[0].startTime || activeBonuses[0].time || regTime);
    } else if (userDeposits && userDeposits.length > 0) {
      fallbackTimestamp = Number(userDeposits[0].time || userDeposits[0].timestamp || regTime);
    }

    let remPerf = Math.round(targetPerf * 1e8) / 1e8;
    let dailyRateVal = 500;
    if (remPerf < 1500) dailyRateVal = 5;
    else if (remPerf < 4500) dailyRateVal = 15;
    else if (remPerf < 15000) dailyRateVal = 150;

    let dayCounter = 1;
    while (remPerf > 0.0001) {
      let dayAmt = Math.min(dailyRateVal, remPerf);
      dayAmt = Math.round(dayAmt * 1e8) / 1e8;
      remPerf = Math.round((remPerf - dayAmt) * 1e8) / 1e8;
      accumulatedPerf += dayAmt;
      cumulativeTotalEarned += dayAmt;

      ledger.push({
        type: "perf_daily",
        typeName: "Performance Daily Salary",
        fromUser: "Contract",
        amount: dayAmt,
        level: "-",
        timestamp: fallbackTimestamp,
        status: "Completed",
        txHash: `0x_fallback_salary_${dayCounter}_${fallbackTimestamp}`,
        blockNumber: 0,
        isFallback: true
      });

      fallbackTimestamp += PERF_ONE_DAY_SECS;
      dayCounter++;
    }
  }

  // --------------------------------------------------------------------------
  // FINALIZE & INVARIANT VALIDATION
  // --------------------------------------------------------------------------

  const genDailyROI = Math.round(accumulatedDailyROI * 1e8) / 1e8;
  const genBoosterROI = Math.round(accumulatedBoosterROI * 1e8) / 1e8;
  const genLevelInc = Math.round(accumulatedLevelIncome * 1e8) / 1e8;
  const genLevelROI = Math.round(accumulatedLevelROI * 1e8) / 1e8;
  const genPerf = Math.round(accumulatedPerf * 1e8) / 1e8;
  const genTotalEarned = Math.round((genDailyROI + genBoosterROI + genLevelInc + genLevelROI + genPerf) * 1e8) / 1e8;

  const diffDailyROI = Math.round(Math.abs(genDailyROI - targetDailyROI) * 1e8) / 1e8;
  const diffBoosterROI = Math.round(Math.abs(genBoosterROI - targetBoosterROI) * 1e8) / 1e8;
  const diffLevelInc = Math.round(Math.abs(genLevelInc - targetLevelIncome) * 1e8) / 1e8;
  const diffLevelROI = Math.round(Math.abs(genLevelROI - targetLevelROI) * 1e8) / 1e8;
  const diffPerf = Math.round(Math.abs(genPerf - targetPerf) * 1e8) / 1e8;

  if (targetDailyROI > 0 && diffDailyROI > 0.05) validationErrors.push(`Daily ROI mismatch. Gen: ${genDailyROI}, Target: ${targetDailyROI}`);
  if (targetBoosterROI > 0 && diffBoosterROI > 0.05) validationErrors.push(`Booster ROI mismatch. Gen: ${genBoosterROI}, Target: ${targetBoosterROI}`);
  if (targetLevelIncome > 0 && genLevelInc > targetLevelIncome + 0.05) validationErrors.push(`Level Income mismatch. Gen: ${genLevelInc}, Target: ${targetLevelIncome}`);
  if (targetLevelROI > 0 && genLevelROI > targetLevelROI + 0.05) validationErrors.push(`Level ROI mismatch. Gen: ${genLevelROI}, Target: ${targetLevelROI}`);
  // Final composite key deduplication for perf_instant events: recordId + _perf_instant_ + timestamp
  const finalLedger = [];
  const seenPerfInstantCompositeKeys = new Set();

  for (const event of ledger) {
    if (event.type === "perf_instant") {
      const recId = event.recordId || 0;
      const compositeKey = `${recId}_perf_instant_${event.timestamp}`;
      if (seenPerfInstantCompositeKeys.has(compositeKey)) {
        continue; // Skip duplicate perf_instant entry
      }
      seenPerfInstantCompositeKeys.add(compositeKey);
    }
    finalLedger.push(event);
  }

  // Pre-return validation: Group all perf_instant entries by recordId
  const instantCountsByRecordId = new Map();
  for (const event of finalLedger) {
    if (event.type === "perf_instant") {
      const rId = event.recordId || 0;
      const count = (instantCountsByRecordId.get(rId) || 0) + 1;
      instantCountsByRecordId.set(rId, count);
      if (count > 1) {
        validationErrors.push(`Invariant Error: Record ID ${rId} has ${count} Instant Reward rows (expected exactly 1).`);
      }
    }
  }

  // Performance Bonus Audit Verification Check
  const perfRecordAuditMap = new Map();
  finalLedger.forEach(event => {
    if (event.type === "perf_instant" || event.type === "perf_daily") {
      const recKey = event.recordId ? `rec_${event.recordId}` : (event.streamId || `type_${event.type}`);
      if (!perfRecordAuditMap.has(recKey)) {
        perfRecordAuditMap.set(recKey, { instantCount: 0, dailyCount: 0, timestamps: new Set() });
      }
      const audit = perfRecordAuditMap.get(recKey);
      if (event.type === "perf_instant") audit.instantCount++;
      if (event.type === "perf_daily") {
        audit.dailyCount++;
        if (audit.timestamps.has(event.timestamp)) {
          validationErrors.push(`Duplicate timestamp detected for performance record ${recKey} at ${event.timestamp}`);
        }
        audit.timestamps.add(event.timestamp);
      }
    }
  });

  perfRecordAuditMap.forEach((audit, recKey) => {
    if (audit.instantCount > 1) {
      validationErrors.push(`Duplicate Instant entry for performance record ${recKey}`);
    }
    if (audit.instantCount > 0 && audit.dailyCount > 0) {
      validationErrors.push(`Collision: Record ${recKey} has both Instant and Daily entries`);
    }
    if (audit.dailyCount > 30) {
      validationErrors.push(`Record ${recKey} exceeded 30 daily payouts (${audit.dailyCount})`);
    }
  });

  // Sort final ledger strictly by timestamp
  finalLedger.sort((a, b) => a.timestamp - b.timestamp);

  // Strict 400% Network Cap Enforcer: Ensures total income events in ledger never exceed maxNetworkCap (400% of total deposits)
  const maxNetworkCapVal = (parseFloat(totalDeposits) > 0 ? parseFloat(totalDeposits) : currentDeposit) * 4.0;
  let runningIncomeSum = 0;
  const cappedFinalLedger = [];

  for (const event of finalLedger) {
    const isIncome = ["roi", "booster_roi", "level_income", "level_roi", "perf_instant", "perf_daily"].includes(event.type);

    if (isIncome) {
      if (maxNetworkCapVal > 0 && runningIncomeSum >= maxNetworkCapVal - 0.0001) {
        continue; // 400% Network Cap reached, skip further income events
      }
      const remCap = maxNetworkCapVal > 0 ? Math.max(0, maxNetworkCapVal - runningIncomeSum) : event.amount;
      const allowedAmount = Math.min(event.amount, remCap);
      const roundedAmount = Math.round(allowedAmount * 1e8) / 1e8;

      if (roundedAmount > 0) {
        runningIncomeSum = Math.round((runningIncomeSum + roundedAmount) * 1e8) / 1e8;
        cappedFinalLedger.push({
          ...event,
          amount: roundedAmount
        });
      }
    } else {
      cappedFinalLedger.push(event);
    }
  }

  // 4. PERFORMANCE REPLAY GENERATED (If replay succeeds)
  const generatedSalaryEvents = ledger.filter(x => x.type === "perf_daily" && !x.isFallback);
  if (generatedSalaryEvents.length > 0) {
    console.log("✅ PERFORMANCE REPLAY GENERATED");
    console.log("Generated Events:", generatedSalaryEvents.length);
    console.log("First Timestamp:", generatedSalaryEvents[0].timestamp);
    console.log("Last Timestamp:", generatedSalaryEvents[generatedSalaryEvents.length - 1].timestamp);
    console.log("Total Amount:", generatedSalaryEvents.reduce((sum, ev) => sum + ev.amount, 0));
  }

  const perfEntries = ledger.filter(x => x.type === "perf_daily");

  // 5. PERFORMANCE SUMMARY
  console.log("========== PERFORMANCE SUMMARY ==========");
  console.log("Fallback Used:", fallbackExecuted);
  console.log("Generated Salary Events:", generatedSalaryEvents.length);
  console.log("Ledger Entries:", perfEntries.length);

  const isValid = validationErrors.length === 0;

  // Determine current active booster tier metadata
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const currentBoosterBps = getBoosterRateAtTime(nowTimestamp);
  let tierName = "Standard";
  let rateText = "0.50% Daily ROI";

  if (currentBoosterBps >= 400) {
    tierName = "Tier 5";
    rateText = " 4.00% ";
  } else if (currentBoosterBps >= 250) {
    tierName = "Tier 4";
    rateText = " 2.50% ";
  } else if (currentBoosterBps >= 200) {
    tierName = "Tier 3";
    rateText = " 2.00% ";
  } else if (currentBoosterBps >= 150) {
    tierName = "Tier 2";
    rateText = " 1.50% ";
  } else if (currentBoosterBps >= 100) {
    tierName = "Tier 1";
    rateText = " 1.00% ";
  }

  const boosterTierInfo = {
    tierName: tierName,
    boosterRateBps: currentBoosterBps,
    rateText: rateText,
    displayText: `${tierName} (${rateText})`
  };

  return {
    success: isValid,
    ledger: cappedFinalLedger,
    boosterTier: boosterTierInfo,
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
      duplicateTxHashes: [],
      duplicateSimIds: [],
      chronologicalViolations: []
    }
  };
}
