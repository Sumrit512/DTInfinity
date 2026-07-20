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
    })),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const userLower = args.user.toLowerCase();
    
    // Clear existing events for this user and contract ONLY if their blockNumber >= fromBlock
    // This allows us to incrementally sync without wiping history!
    const allEventsInTable = await ctx.db.query("onChainEvents").collect();
    const userEvents = allEventsInTable.filter(doc => doc.user.toLowerCase() === userLower);
    
    for (const doc of userEvents) {
      // Always clear simulated/generated events when syncing to prevent duplicate reporting
      const isSimulatedOrGenerated = doc.isSimulated || 
        doc.blockNumber === 0 || 
        doc.txHash.startsWith("0x_gen_") || 
        doc.txHash.startsWith("0x_evt_") ||
        !doc.contractAddress ||
        doc.contractAddress.toLowerCase() !== contractLower;
        
      if (isSimulatedOrGenerated) {
        await ctx.db.delete(doc._id);
      } 
      // If a fromBlock is provided (real sync), clear real events from that block onwards
      else if (args.fromBlock !== undefined && doc.blockNumber >= args.fromBlock) {
        await ctx.db.delete(doc._id);
      }
    }

    // Insert the current active list of events
    for (const event of args.events) {
      const txHashLower = event.txHash.toLowerCase();
      await ctx.db.insert("onChainEvents", {
        ...event,
        contractAddress: contractLower,
        user: userLower,
        txHash: txHashLower,
        fromUser: event.fromUser.toLowerCase(),
      });
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

    // 1. Fetch on-chain events stored in DB
    const dbEvents = await ctx.db
      .query("onChainEvents")
      .withIndex("by_contract_address_user_time", (q) =>
        q.eq("contractAddress", contractLower).eq("user", addr)
      )
      .collect();

    // 2. Fetch deposits stored in DB
    const dbDeposits = await ctx.db
      .query("deposits")
      .withIndex("by_contract_address_user", (q) =>
        q.eq("contractAddress", contractLower).eq("user", addr)
      )
      .collect();

    // 3. Fetch withdrawals stored in DB
    const dbWithdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_contract_address_user", (q) =>
        q.eq("contractAddress", contractLower).eq("user", addr)
      )
      .collect();

    const formattedEvents = dbEvents.map(e => ({
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

    // Deduplicate by txHash or composite key
    const seenKeys = new Set();
    const uniqueList = [];
    for (const item of combined) {
      const key = item.txHash ? item.txHash.toLowerCase() : `${item.type}_${item.timestamp}_${item.amount}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueList.push(item);
      }
    }

    // Sort by timestamp descending (latest first)
    uniqueList.sort((a, b) => b.timestamp - a.timestamp);

    return uniqueList;
  }
});
