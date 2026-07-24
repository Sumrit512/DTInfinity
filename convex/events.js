import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncOnChainEvents = mutation({
  args: {
    contractAddress: v.string(),
    user: v.string(),
    fromBlock: v.optional(v.number()),
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
      logIndex: v.optional(v.number()),
      user: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const userLower = args.user.toLowerCase();
    
    // Fetch all existing events for this user and contract from Convex DB (Source of Truth)
    const allEventsInTable = await ctx.db.query("onChainEvents").collect();
    const userEvents = allEventsInTable.filter(
      doc => doc.user.toLowerCase() === userLower &&
             doc.contractAddress &&
             doc.contractAddress.toLowerCase() === contractLower
    );
    
    const existingKeys = new Set();
    
    for (const doc of userEvents) {
      const isSimulatedOrGenerated = doc.isSimulated || 
        !doc.blockNumber ||
        doc.blockNumber === 0 || 
        !doc.txHash ||
        doc.txHash.length !== 66 ||
        doc.txHash.includes("_");
        
      if (isSimulatedOrGenerated) {
        // Clean up temporary UI/simulated state items to keep stored state clean
        await ctx.db.delete(doc._id);
      } else {
        const txHashLower = doc.txHash.toLowerCase();
        const fromUserLower = doc.fromUser.toLowerCase();
        const key2 = `${txHashLower}|${doc.type}|${fromUserLower}|${doc.level}|${doc.amount}|${doc.timestamp}`;
        
        let isDuplicate = existingKeys.has(key2);
        if (doc.logIndex !== undefined && doc.logIndex !== null) {
          const key1 = `${txHashLower}|${doc.logIndex}`;
          if (existingKeys.has(key1)) {
            isDuplicate = true;
          }
        }
        
        if (isDuplicate) {
          // Clean up existing duplicates in the database automatically
          await ctx.db.delete(doc._id);
        } else {
          existingKeys.add(key2);
          if (doc.logIndex !== undefined && doc.logIndex !== null) {
            existingKeys.add(`${txHashLower}|${doc.logIndex}`);
          }
        }
      }
    }

    // Filter incoming blockchain events to isolate only missing data not yet in Convex
    const missingEvents = [];
    for (const event of args.events) {
      if (event.isSimulated) continue; // Skip simulated items in database persistence
      
      const txHashLower = event.txHash.toLowerCase();
      const fromUserLower = event.fromUser.toLowerCase();
      const key2 = `${txHashLower}|${event.type}|${fromUserLower}|${event.level}|${event.amount}|${event.timestamp}`;
      
      let isDuplicate = existingKeys.has(key2);
      if (event.logIndex !== undefined && event.logIndex !== null) {
        const key1 = `${txHashLower}|${event.logIndex}`;
        if (existingKeys.has(key1)) {
          isDuplicate = true;
        }
      }

      if (!isDuplicate) {
        existingKeys.add(key2);
        if (event.logIndex !== undefined && event.logIndex !== null) {
          existingKeys.add(`${txHashLower}|${event.logIndex}`);
        }
        missingEvents.push({
          ...event,
          contractAddress: contractLower,
          user: userLower,
          txHash: txHashLower,
          fromUser: fromUserLower,
        });
      }
    }

    // Sort missing events in strict ascending chronological order before inserting into database
    missingEvents.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return (a.logIndex || 0) - (b.logIndex || 0);
    });

    // Append missing chronological events to Convex DB
    for (const event of missingEvents) {
      await ctx.db.insert("onChainEvents", event);
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
      lastClaimTime: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const addr = args.address.toLowerCase();

    // 1. Fetch on-chain events stored in DB for this user
    const allEventsInTable = await ctx.db.query("onChainEvents").collect();
    let dbEvents = allEventsInTable.filter(e => e.user && e.user.toLowerCase() === addr);
    if (contractLower && contractLower !== "0x0000000000000000000000000000000000000000") {
      const matchContract = dbEvents.filter(e => e.contractAddress && e.contractAddress.toLowerCase() === contractLower);
      if (matchContract.length > 0) {
        dbEvents = matchContract;
      }
    }

    // Filter out synthetic candidate or legacy simulated events
    const realDbEvents = dbEvents.filter(e =>
      !e.isSimulated &&
      e.blockNumber &&
      e.blockNumber > 0 &&
      e.txHash &&
      e.txHash.length === 66 &&
      !e.txHash.includes("_")
    );

    // 2. Fetch deposits stored in DB
    const allDepositsTable = await ctx.db.query("deposits").collect();
    let dbDeposits = allDepositsTable.filter(d => d.user && d.user.toLowerCase() === addr);
    if (contractLower && contractLower !== "0x0000000000000000000000000000000000000000") {
      const matchDep = dbDeposits.filter(d => d.contractAddress && d.contractAddress.toLowerCase() === contractLower);
      if (matchDep.length > 0) {
        dbDeposits = matchDep;
      }
    }

    // 3. Fetch withdrawals stored in DB
    const allWithdrawalsTable = await ctx.db.query("withdrawals").collect();
    let dbWithdrawals = allWithdrawalsTable.filter(w => w.user && w.user.toLowerCase() === addr);
    if (contractLower && contractLower !== "0x0000000000000000000000000000000000000000") {
      const matchWith = dbWithdrawals.filter(w => w.contractAddress && w.contractAddress.toLowerCase() === contractLower);
      if (matchWith.length > 0) {
        dbWithdrawals = matchWith;
      }
    }

    const formattedEvents = realDbEvents.map(e => ({
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
      tierIndex: e.tierIndex,
      logIndex: e.logIndex,
    }));

    const formattedDeposits = dbDeposits.map(d => ({
      type: "deposit",
      typeName: "Deposit",
      fromUser: d.user,
      amount: d.amount,
      level: "-",
      timestamp: d.time,
      status: "Completed",
      txHash: d.actualTxHash || d.txHash,
      blockNumber: 0,
      isSimulated: false,
    }));

    const formattedWithdrawals = dbWithdrawals.map(w => ({
      type: "withdraw",
      typeName: "Withdrawal",
      fromUser: w.user,
      amount: w.amount,
      level: "-",
      timestamp: w.time,
      status: "Completed",
      txHash: w.actualTxHash || w.txHash,
      blockNumber: 0,
      isSimulated: false,
    }));

    const combined = [...formattedEvents, ...formattedDeposits, ...formattedWithdrawals];

    // Deduplicate: use logIndex for real on-chain events, composite key for simulated/deposits/withdrawals
    const seenKeys = new Set();
    const uniqueList = [];
    for (const item of combined) {
      let key;
      if (item.logIndex !== undefined && item.logIndex !== null) {
        // Real on-chain events: txHash + logIndex is globally unique
        key = `${item.txHash.toLowerCase()}|${item.logIndex}`;
      } else if (item.txHash) {
        key = `${item.txHash.toLowerCase()}|${item.type}|${(item.fromUser || "").toLowerCase()}|${item.level}|${item.amount}`;
      } else {
        key = `${item.type}_${item.timestamp}_${item.amount}_${(item.fromUser || "").toLowerCase()}`;
      }
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueList.push(item);
      }
    }

    // Chronological capping pass ascending
    const ascList = [...uniqueList].sort((a, b) => a.timestamp - b.timestamp);
    let currentDeposit = 0;
    let cumulativeNetworkEarned = 0;

    const cappedList = ascList.map(evt => {
      if (evt.type === "deposit") {
        currentDeposit += evt.amount;
        return evt;
      }
      if (evt.type === "withdraw") return evt;

      const maxNetworkCap = currentDeposit * 4.0;
      const remNetCap = Math.max(0, maxNetworkCap - cumulativeNetworkEarned);

      let amt = evt.amount;
      if (["perf_instant", "perf_daily", "perf_claim"].includes(evt.type)) {
        amt = Math.min(amt, remNetCap);
        amt = Math.round(amt * 1e8) / 1e8;
      }

      if (["level_income", "level_roi", "perf_instant", "perf_daily", "perf_claim"].includes(evt.type)) {
        cumulativeNetworkEarned += amt;
      }

      return {
        ...evt,
        amount: amt
      };
    });

    // Sort by timestamp descending (latest first) with event type priority for equal timestamps
    const priorityMap = { perf_daily: 4, perf_instant: 4, perf_claim: 4, roi: 3, booster_roi: 3, level_income: 2, level_roi: 2, withdraw: 1, deposit: 0 };
    cappedList.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
      const prioA = priorityMap[a.type] !== undefined ? priorityMap[a.type] : 2;
      const prioB = priorityMap[b.type] !== undefined ? priorityMap[b.type] : 2;
      return prioB - prioA;
    });

    return cappedList;
  }
});
