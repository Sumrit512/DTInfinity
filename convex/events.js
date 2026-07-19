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
      lastClaimTime: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const addr = args.address.toLowerCase();

    const dbEvents = await ctx.db
      .query("onChainEvents")
      .withIndex("by_contract_address_user_time", (q) =>
        q.eq("contractAddress", contractLower).eq("user", addr)
      )
      .collect();

    // Sort by timestamp descending (latest first)
    const sorted = dbEvents.map(e => ({
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
    })).sort((a, b) => b.timestamp - a.timestamp);

    return sorted;
  }
});
