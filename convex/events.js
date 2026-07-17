import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncOnChainEvents = mutation({
  args: {
    contractAddress: v.string(),
    user: v.string(),
    events: v.array(v.object({
      type: v.string(),
      typeName: v.string(),
      fromUser: v.string(),
      amount: v.number(),
      level: v.string(),
      timestamp: v.number(),
      status: v.string(),
      txHash: v.string(),
      blockNumber: v.number(),
      isSimulated: v.boolean(),
      tierIndex: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const userLower = args.user.toLowerCase();
    for (const event of args.events) {
      const txHashLower = event.txHash.toLowerCase();
      const existing = await ctx.db
        .query("onChainEvents")
        .withIndex("by_txHash", (q) => q.eq("txHash", txHashLower))
        .unique();
      if (!existing) {
        await ctx.db.insert("onChainEvents", {
          ...event,
          contractAddress: contractLower,
          user: userLower,
          txHash: txHashLower,
          fromUser: event.fromUser.toLowerCase(),
        });
      }
    }
  },
});

export const getLedger = query({
  args: {
    contractAddress: v.string(),
    address: v.string(),
    currentOneDayVal: v.optional(v.number()),
    currentPerfOneDayVal: v.optional(v.number()),
    levelIncomeEarned: v.optional(v.number()),
    levelROIEarned: v.optional(v.number()),
    performanceBonusEarned: v.optional(v.number()),
    totalWithdrawn: v.optional(v.number()),
    activeBonuses: v.optional(v.array(v.object({
      tierIndex: v.number(),
      dailyRate: v.number(),
      startTime: v.number(),
      endTime: v.number(),
      lastClaimTime: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const addr = args.address.toLowerCase();
    const ONE_DAY_SECS = args.currentOneDayVal || 86400;
    const PERF_ONE_DAY_SECS = args.currentPerfOneDayVal || 86400;

    const rootUser = await ctx.db
      .query("users")
      .withIndex("by_contract_address_address", (q) =>
        q.eq("contractAddress", contractLower).eq("address", addr)
      )
      .unique();

    if (!rootUser || rootUser.totalDeposits === 0) {
      return [];
    }

    const sponsorJoin = rootUser.registrationTime;
    const sponsorDeposit = rootUser.totalDeposits;
    const now = Math.floor(Date.now() / 1000);
    const numDays = Math.floor((now - sponsorJoin) / ONE_DAY_SECS);

    const userDeps = await ctx.db
      .query("deposits")
      .withIndex("by_contract_address_user", (q) =>
        q.eq("contractAddress", contractLower).eq("user", addr)
      )
      .collect();
    const sortedDeps = [...userDeps].sort((a, b) => a.time - b.time);
    
    const upgradeDepositsSum = sortedDeps
      .filter(d => d.time > sponsorJoin)
      .reduce((sum, d) => sum + d.amount, 0);
    const initialDep = Math.max(0, sponsorDeposit - upgradeDepositsSum);

    function getActiveDepositAtTime(timestamp) {
      let activeDep = initialDep;
      sortedDeps.forEach(dep => {
        if (dep.time <= timestamp && dep.time > sponsorJoin) {
          activeDep += dep.amount;
        }
      });
      return activeDep;
    }

    const directRefs = await ctx.db
      .query("referrals")
      .withIndex("by_contract_address_sponsor", (q) =>
        q.eq("contractAddress", contractLower).eq("sponsor", addr)
      )
      .collect();
    const directAddresses = directRefs.map(r => r.referral);

    const directsData = [];
    for (const childAddr of directAddresses) {
      const childUser = await ctx.db
        .query("users")
        .withIndex("by_contract_address_address", (q) =>
          q.eq("contractAddress", contractLower).eq("address", childAddr)
        )
        .unique();
      if (childUser) {
        directsData.push({
          address: childAddr,
          registrationTime: childUser.registrationTime,
          totalDeposits: childUser.totalDeposits,
        });
      }
    }

    // Helper to calculate booster rate on a given timestamp
    function getBoosterRateAtTime(timestamp) {
      let refs5 = 0, refs10 = 0, refs15 = 0, refs20 = 0, refs25 = 0;
      for (const d of directsData) {
        if (d.registrationTime > timestamp) continue;
        if (d.registrationTime > sponsorJoin + 25 * ONE_DAY_SECS) continue;

        const currentSponsorDeposit = getActiveDepositAtTime(timestamp);
        if (d.totalDeposits >= currentSponsorDeposit) {
          if (d.registrationTime >= sponsorJoin) {
            const diff = d.registrationTime - sponsorJoin;
            if (diff <= 5 * ONE_DAY_SECS) refs5++;
            if (diff <= 10 * ONE_DAY_SECS) refs10++;
            if (diff <= 15 * ONE_DAY_SECS) refs15++;
            if (diff <= 20 * ONE_DAY_SECS) refs20++;
            if (diff <= 25 * ONE_DAY_SECS) refs25++;
          }
        }
      }

      if (refs25 >= 10) return 400;
      if (refs20 >= 8) return 250;
      if (refs15 >= 6) return 200;
      if (refs10 >= 4) return 150;
      if (refs5 >= 2) return 100;
      return 50;
    }

    // Helper to calculate the locked booster rate at a given timestamp in the simulation
    function getLockedBoosterRateAtTime(timestamp) {
      let lockedRate = 0;
      let runningDeposit = initialDep;
      let runningEarned = 0;

      const upgrades = sortedDeps.filter(d => d.time > sponsorJoin && d.time <= timestamp);
      if (upgrades.length === 0) return 0;

      let currentSponsorJoin = sponsorJoin;
      for (const upgrade of upgrades) {
        const elapsed = upgrade.time - currentSponsorJoin;
        const days = Math.floor(elapsed / ONE_DAY_SECS);
        
        for (let d = 1; d <= days; d++) {
          const payoutTime = currentSponsorJoin + d * ONE_DAY_SECS;
          const maxROI = runningDeposit * 2.2;
          const maxNetwork = runningDeposit * 4.0;
          const maxLimit = Math.min(maxROI, maxNetwork);

          const otherIncomes = rawEvents
            .filter(e => e.timestamp > currentSponsorJoin && e.timestamp <= payoutTime && e.type !== "roi")
            .reduce((sum, e) => sum + e.rawAmount, 0);
          
          runningEarned += otherIncomes;

          const rateBps = lockedRate > 0 ? lockedRate : getBoosterRateAtTime(payoutTime);
          let dailyRoi = (runningDeposit * rateBps) / 10000;
          if (runningEarned >= maxLimit) {
            dailyRoi = 0;
          } else if (runningEarned + dailyRoi > maxLimit) {
            dailyRoi = maxLimit - runningEarned;
          }
          runningEarned += dailyRoi;
        }

        const maxROI = runningDeposit * 2.2;
        if (runningEarned >= maxROI) {
          lockedRate = 50;
        } else {
          const currentRate = getBoosterRateAtTime(upgrade.time);
          if (currentRate > 50) {
            lockedRate = currentRate;
          }
        }

        runningDeposit += upgrade.amount;
        currentSponsorJoin = upgrade.time;
      }

      return lockedRate;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED CHRONOLOGICAL SIMULATION
    // All income streams are collected as raw (uncapped) events first,
    // then sorted by timestamp, then processed in a SINGLE PASS with one
    // running total that enforces both caps simultaneously:
    //   • 220% cap  → stops Daily ROI + Booster ROI
    //   • 400% cap  → stops ALL income
    // ═══════════════════════════════════════════════════════════════════════════

    const rawEvents = [];

    // ── 1. Level Income (one-time per referral at their join time) ────────────
    const levelIncomePercentages = [500, 200, 100, 100, 100];
    const levelIncQueue = [{ address: addr, level: 0 }];
    const levelIncVisited = new Set([addr]);
    let levelIncHead = 0;
    while (levelIncHead < levelIncQueue.length) {
      const curr = levelIncQueue[levelIncHead++];
      if (curr.level >= 5) continue;

      const currChildrenRefs = await ctx.db
        .query("referrals")
        .withIndex("by_contract_address_sponsor", (q) =>
          q.eq("contractAddress", contractLower).eq("sponsor", curr.address)
        )
        .collect();
      const currChildren = currChildrenRefs.map(r => r.referral);

      for (const childAddr of currChildren) {
        if (!levelIncVisited.has(childAddr)) {
          levelIncVisited.add(childAddr);
          const childUser = await ctx.db
            .query("users")
            .withIndex("by_contract_address_address", (q) =>
              q.eq("contractAddress", contractLower).eq("address", childAddr)
            )
            .unique();
          if (childUser) {
            const childDeps = await ctx.db
              .query("deposits")
              .withIndex("by_contract_address_user", (q) =>
                q.eq("contractAddress", contractLower).eq("user", childAddr)
              )
              .collect();

            let sortedChildDeps = [...childDeps].sort((a, b) => a.time - b.time);
            const childDepsSum = sortedChildDeps.reduce((sum, d) => sum + d.amount, 0);
            if (childDepsSum < childUser.totalDeposits - 0.01) {
              sortedChildDeps.push({
                amount: childUser.totalDeposits - childDepsSum,
                time: childUser.registrationTime,
                txHash: "0x_fallback_child_dep",
              });
              sortedChildDeps.sort((a, b) => a.time - b.time);
            }

            let childRunningDepositTotal = 0;
            for (let depIndex = 0; depIndex < sortedChildDeps.length; depIndex++) {
              const dep = sortedChildDeps[depIndex];
              childRunningDepositTotal += dep.amount;

              const currentSponsorDeposit = getActiveDepositAtTime(dep.time);
              const qualifiedDirectsAtTime = directsData.filter(
                dr => dr.registrationTime <= dep.time && dr.totalDeposits >= 50
              ).length;

              if (childRunningDepositTotal >= 10 && currentSponsorDeposit >= 10 && qualifiedDirectsAtTime >= curr.level + 1) {
                const pct = levelIncomePercentages[curr.level];
                const commission = (dep.amount * pct) / 10000;
                if (commission > 0) {
                  rawEvents.push({
                    type: "level_income",
                    typeName: "Level Income",
                    fromUser: childAddr,
                    rawAmount: commission,
                    level: (curr.level + 1).toString(),
                    timestamp: dep.time,
                    status: "Completed",
                    txHash: `0x_linc_${childAddr}_${curr.level + 1}_${depIndex}_${dep.time}`,
                    blockNumber: 0,
                    isSimulated: true
                  });
                }
              }
            }
            levelIncQueue.push({ address: childAddr, level: curr.level + 1 });
          }
        }
      }
    }

    // ── 2. Level ROI Matching (per downline day, child's own cap applied) ─────
    const levelROIPercentages = [
      1500, 1000, 500, 500, 500, 400, 400, 400, 400, 400,
      300, 300, 300, 300, 300, 200, 200, 200, 200, 200
    ];

    const downlinesForROI = [];
    const roiQueue = [{ address: addr, level: 0 }];
    const roiVisited = new Set([addr]);
    let roiHead = 0;
    const userMap = new Map();
    const referralsMap = new Map();

    userMap.set(addr.toLowerCase(), {
      address: addr.toLowerCase(),
      registrationTime: rootUser.registrationTime,
      totalDeposits: rootUser.totalDeposits,
      levelIncomeEarned: rootUser.levelIncomeEarned || 0,
      levelROIEarned: rootUser.levelROIEarned || 0,
      performanceBonusEarned: rootUser.performanceBonusEarned || 0,
    });

    while (roiHead < roiQueue.length) {
      const curr = roiQueue[roiHead++];
      if (curr.level >= 21) continue;

      const currChildrenRefs = await ctx.db
        .query("referrals")
        .withIndex("by_contract_address_sponsor", (q) =>
          q.eq("contractAddress", contractLower).eq("sponsor", curr.address.toLowerCase())
        )
        .collect();
      const currChildren = currChildrenRefs.map(r => r.referral.toLowerCase());
      referralsMap.set(curr.address.toLowerCase(), currChildren);

      for (const childAddr of currChildren) {
        if (!roiVisited.has(childAddr)) {
          roiVisited.add(childAddr);
          const childUser = await ctx.db
            .query("users")
            .withIndex("by_contract_address_address", (q) =>
              q.eq("contractAddress", contractLower).eq("address", childAddr)
            )
            .unique();
          if (childUser) {
            const childLower = childAddr.toLowerCase();
            userMap.set(childLower, {
              address: childLower,
              registrationTime: childUser.registrationTime,
              totalDeposits: childUser.totalDeposits,
              levelIncomeEarned: childUser.levelIncomeEarned || 0,
              levelROIEarned: childUser.levelROIEarned || 0,
              performanceBonusEarned: childUser.performanceBonusEarned || 0,
            });
            if (curr.level < 20) {
              downlinesForROI.push({
                address: childLower,
                level: curr.level + 1,
                registrationTime: childUser.registrationTime,
                totalDeposits: childUser.totalDeposits,
                node: childUser
              });
            }
            roiQueue.push({ address: childLower, level: curr.level + 1 });
          }
        }
      }
    }

    for (const child of downlinesForROI) {
      if (child.totalDeposits < 50) continue;
      const numChildDays = Math.floor((now - child.registrationTime) / ONE_DAY_SECS);
      if (numChildDays <= 0) continue;

      const childNode = child.node;
      let childCumulative = (childNode.levelIncomeEarned || 0)
        + (childNode.levelROIEarned || 0)
        + (childNode.performanceBonusEarned || 0);

      const childChildAddrs = referralsMap.get(child.address.toLowerCase()) || [];
      const childDirectsData = childChildAddrs
        .map(a => userMap.get(a.toLowerCase()))
        .filter(Boolean)
        .map(u => ({ registrationTime: u.registrationTime, totalDeposits: u.totalDeposits }));

      for (let k = 1; k <= numChildDays; k++) {
        const matchTime = child.registrationTime + k * ONE_DAY_SECS;
        let childRateBps = 50;

        if (childDirectsData.length > 0) {
          let cRefs5 = 0, cRefs10 = 0, cRefs15 = 0, cRefs20 = 0, cRefs25 = 0;
          for (const gc of childDirectsData) {
            if (gc.registrationTime > matchTime) continue;
            if (gc.registrationTime > child.registrationTime + 25 * ONE_DAY_SECS) continue;
            if (gc.totalDeposits >= child.totalDeposits) {
              const diff = gc.registrationTime - child.registrationTime;
              if (diff >= 0) {
                if (diff <= 5 * ONE_DAY_SECS) cRefs5++;
                if (diff <= 10 * ONE_DAY_SECS) cRefs10++;
                if (diff <= 15 * ONE_DAY_SECS) cRefs15++;
                if (diff <= 20 * ONE_DAY_SECS) cRefs20++;
                if (diff <= 25 * ONE_DAY_SECS) cRefs25++;
              }
            }
          }
          if (cRefs25 >= 10) childRateBps = 400;
          else if (cRefs20 >= 8) childRateBps = 250;
          else if (cRefs15 >= 6) childRateBps = 200;
          else if (cRefs10 >= 4) childRateBps = 150;
          else if (cRefs5 >= 2) childRateBps = 100;
        }

        const childRoiAmt = (child.totalDeposits * childRateBps) / 10000;
        const childMaxROI = child.totalDeposits * 2.2;
        let actualChildRoi = childRoiAmt;
        if (childCumulative >= childMaxROI) actualChildRoi = 0;
        else if (childCumulative + childRoiAmt > childMaxROI) actualChildRoi = childMaxROI - childCumulative;
        childCumulative += actualChildRoi;

        const sponsorDepAtMatch = getActiveDepositAtTime(matchTime);
        const qualifiedDirectsOnDay = directsData.filter(
          dr => dr.registrationTime <= matchTime && dr.totalDeposits >= 50
        ).length;

        if (sponsorDepAtMatch >= 50 && qualifiedDirectsOnDay >= child.level && actualChildRoi > 0) {
          const levelRoiPct = levelROIPercentages[child.level - 1] || 0;
          const commission = (actualChildRoi * levelRoiPct) / 10000;
          if (commission > 0) {
            const isClaimed = child.node && child.node.lastUpdateROI ? (matchTime <= child.node.lastUpdateROI) : false;
            rawEvents.push({
              type: "level_roi",
              typeName: "Level ROI Matching",
              fromUser: child.address,
              rawAmount: commission,
              level: child.level.toString(),
              timestamp: matchTime,
              status: isClaimed ? "Completed" : "Pending (Downline Claim)",
              txHash: `0x_lroi_${child.address}_${k}`,
              blockNumber: 0,
              isSimulated: true
            });
          }
        }
      }
    }

    // ── 3. Performance Daily Salary ──────────────────────────────────────────
    let activeBonuses = [];
    if (args.activeBonuses && args.activeBonuses.length > 0) {
      activeBonuses = args.activeBonuses.map(b => ({
        tierIndex: b.tierIndex,
        dailyRate: b.dailyRate,
        startTime: b.startTime,
        endTime: b.endTime
      }));
    } else {
      const performanceClaims = await ctx.db
        .query("onChainEvents")
        .withIndex("by_contract_address_user_time", (q) =>
          q.eq("contractAddress", contractLower).eq("user", addr)
        )
        .collect();

      const PERFORMANCE_TIERS = [
        { daily: 5 }, { daily: 10 }, { daily: 25 }, { daily: 50 }, { daily: 150 }, { daily: 500 }
      ];

      performanceClaims.forEach(event => {
        if ((event.type === "perf_claim" || event.type === "perf_daily") && event.tierIndex !== undefined) {
          const tier = PERFORMANCE_TIERS[event.tierIndex];
          if (tier) {
            activeBonuses.push({
              tierIndex: event.tierIndex,
              dailyRate: tier.daily,
              startTime: event.timestamp,
              endTime: event.timestamp + 30 * PERF_ONE_DAY_SECS
            });
          }
        }
      });
    }

    activeBonuses.forEach((bonus, bIdx) => {
      const streamStart = bonus.startTime;
      const streamEnd = Math.min(now, bonus.endTime);
      const streamDays = Math.floor((streamEnd - streamStart) / PERF_ONE_DAY_SECS);
      for (let day = 1; day <= streamDays; day++) {
        const salaryTime = streamStart + day * PERF_ONE_DAY_SECS;
        rawEvents.push({
          type: "perf_daily",
          typeName: "Performance Daily Salary",
          fromUser: "Contract",
          rawAmount: bonus.dailyRate,
          level: "-",
          timestamp: salaryTime,
          status: "Completed",
          txHash: `0x_salary_${bIdx}_${day}`,
          blockNumber: 0,
          isSimulated: true,
          tierIndex: bonus.tierIndex
        });
      }
    });

    const totalLevelIncOnChain = args.levelIncomeEarned || 0;
    const simulatedLevelIncSum = rawEvents.filter(t => t.type === "level_income").reduce((s, t) => s + t.rawAmount, 0);
    const levelIncDiff = totalLevelIncOnChain - simulatedLevelIncSum;
    if (levelIncDiff > 0.01) {
      rawEvents.push({
        type: "level_income",
        typeName: "Level Income",
        fromUser: "Deeper Downline",
        rawAmount: levelIncDiff,
        level: ">1",
        timestamp: sponsorJoin + 1800,
        status: "Completed",
        txHash: "0x_fallback_level_inc",
        blockNumber: 0,
        isSimulated: true
      });
    }

    const totalPerfClaimedOnChain = args.performanceBonusEarned || 0;
    const simulatedPerfDailyClaimedSum = rawEvents.filter(t => t.type === "perf_daily").reduce((s, t) => s + t.rawAmount, 0);
    const perfInstantDiff = totalPerfClaimedOnChain - simulatedPerfDailyClaimedSum;
    if (perfInstantDiff > 0.01) {
      rawEvents.push({
        type: "perf_instant",
        typeName: "Performance Bonus (Instant)",
        fromUser: "Contract",
        rawAmount: perfInstantDiff,
        level: "-",
        timestamp: sponsorJoin + 1800,
        status: "Completed",
        txHash: "0x_synthetic_perf_instant",
        blockNumber: 0,
        isSimulated: true
      });
    }

    // ── 4. Daily ROI + Booster ROI ────────────────────────────────────────────
    for (let d = 1; d <= numDays; d++) {
      const dayTime = sponsorJoin + d * ONE_DAY_SECS;
      const lockedRate = getLockedBoosterRateAtTime(dayTime);
      const rateBps = lockedRate > 0 ? lockedRate : getBoosterRateAtTime(dayTime);
      const currentDeposit = getActiveDepositAtTime(dayTime);
      const rawDailyRoi = (currentDeposit * rateBps) / 10000;
      if (rawDailyRoi > 0) {
        const isBoosted = rateBps > 50;
        rawEvents.push({
          type: "roi",
          typeName: isBoosted ? "Daily & Booster ROI Payout" : "Daily ROI Payout",
          fromUser: "Contract",
          rawAmount: rawDailyRoi,
          level: "-",
          timestamp: dayTime,
          status: "Completed",
          txHash: `0x_roi_${d}`,
          blockNumber: 0,
          isSimulated: true
        });
      }
    }

    // ── 5. Sort all events chronologically ───────────────────────────────────
    rawEvents.sort((a, b) => a.timestamp - b.timestamp);

    // ── 6. Single-pass cap enforcement ───────────────────────────────────────
    // Running total accumulates ALL income streams.
    // • When runningTotal >= deposit*2.2 → Daily/Booster ROI stops
    // • When runningTotal >= deposit*4.0 → ALL income stops
    const list = [];
    let runningTotal = 0;

    // ── Fetch withdrawals and on-chain events for final merge ─────────────────
    const userWithdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_contract_address_user", (q) =>
        q.eq("contractAddress", contractLower).eq("user", addr)
      )
      .collect();

    const onChainDeposits = sortedDeps.map((d) => ({
      type: "deposit",
      typeName: "Deposit",
      fromUser: "Self",
      amount: d.amount,
      level: "-",
      timestamp: d.time,
      status: "Completed",
      txHash: d.txHash,
      blockNumber: 0
    }));

    const onChainDepositsSum = onChainDeposits.reduce((sum, d) => sum + d.amount, 0);
    if (onChainDepositsSum < rootUser.totalDeposits - 0.01) {
      onChainDeposits.push({
        type: "deposit",
        typeName: "Deposit",
        fromUser: "Self",
        amount: rootUser.totalDeposits - onChainDepositsSum,
        level: "-",
        timestamp: sponsorJoin,
        status: "Completed",
        txHash: "0x_fallback_deposit",
        blockNumber: 0
      });
    }

    const onChainWithdrawals = userWithdrawals.map((w) => ({
      type: "withdraw",
      typeName: "Withdrawal",
      fromUser: "Self",
      amount: w.amount,
      level: "-",
      timestamp: w.time,
      status: "Completed",
      txHash: w.txHash,
      blockNumber: 0
    }));

    const totalWithdrawnOnChain = args.totalWithdrawn || 0;
    const onChainWithdrawalsSum = onChainWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    if (onChainWithdrawalsSum < totalWithdrawnOnChain - 0.01) {
      onChainWithdrawals.push({
        type: "withdraw",
        typeName: "Withdrawal",
        fromUser: "Self",
        amount: totalWithdrawnOnChain - onChainWithdrawalsSum,
        level: "-",
        timestamp: sponsorJoin + 86400,
        status: "Completed",
        txHash: "0x_fallback_withdraw",
        blockNumber: 0
      });
    }

    const dbEvents = await ctx.db
      .query("onChainEvents")
      .withIndex("by_contract_address_user_time", (q) =>
        q.eq("contractAddress", contractLower).eq("user", addr)
      )
      .collect();

    const dbEventsMapped = dbEvents.map(e => ({
      type: e.type,
      typeName: e.typeName,
      fromUser: e.fromUser,
      amount: e.amount,
      level: e.level,
      timestamp: e.timestamp,
      status: e.status,
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      isSimulated: e.isSimulated || false,
      tierIndex: e.tierIndex
    }));

    // Remove simulated entries that already exist as confirmed on-chain events
    const combined = [...onChainDeposits, ...onChainWithdrawals, ...dbEventsMapped];
    const simulatedFiltered = rawEvents.filter(sim => {
      return !combined.some(onChain =>
        onChain.type === sim.type &&
        onChain.fromUser.toLowerCase() === sim.fromUser.toLowerCase() &&
        Math.abs(onChain.timestamp - sim.timestamp) < 60
      );
    });

    // Merge confirmed + non-duplicate simulated events
    const finalTxs = [...combined, ...simulatedFiltered];

    // Sort chronologically (deposits first on same timestamp)
    finalTxs.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.type === "deposit" && b.type !== "deposit") return -1;
      if (a.type !== "deposit" && b.type === "deposit") return 1;
      return 0;
    });

    // ── Final cap enforcement pass ────────────────────────────────────────────
    // Applies chronologically to simulated entries, using the user's final/current deposit limit
    // to match on-chain dynamic/state-based capping behavior upon package upgrades.
    // Confirmed on-chain transactions are never capped down.
    // • Daily ROI / Booster ROI: stopped when runningTotal >= final deposit × 2.2
    // • All other income:        stopped when runningTotal >= final deposit × 4.0
    let runningTotalEarned = 0;
    let runningDeposit = 0;
    const finalDeposit = rootUser.totalDeposits || 0;

    const cappedTxs = finalTxs.map(tx => {
      if (tx.type === "deposit") {
        runningDeposit += tx.amount;
        return tx;
      }
      if (tx.type === "withdraw") return tx;

      const maxROI     = finalDeposit * 2.2;
      const maxNetwork = finalDeposit * 4.0;
      
      const allowedNetwork = Math.max(0, maxNetwork - runningTotalEarned);
      const startAmount = tx.rawAmount !== undefined ? tx.rawAmount : tx.amount;
      let allowed = startAmount;
      
      if (!tx.isSimulated) {
        runningTotalEarned += allowed;
        return tx;
      }

      if (tx.type === "roi" || tx.type === "booster_roi") {
        const allowedROI = Math.max(0, maxROI - runningTotalEarned);
        allowed = Math.min(startAmount, allowedNetwork, allowedROI);
      } else {
        allowed = Math.min(startAmount, allowedNetwork);
      }
      
      runningTotalEarned += allowed;
      
      return {
        ...tx,
        amount: allowed
      };
    });

    cappedTxs.sort((a, b) => b.timestamp - a.timestamp);

    return cappedTxs;
  }
});
