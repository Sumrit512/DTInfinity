import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertUser = mutation({
  args: {
    contractAddress: v.string(),
    address: v.string(),
    sponsor: v.string(),
    totalDeposits: v.number(),
    registrationTime: v.number(),
    lastUpdateROI: v.number(),
    claimableBalance: v.number(),
    totalWithdrawn: v.number(),
    directCount: v.number(),
    qualifiedDirectsCount: v.number(),
    totalTeamCount: v.number(),
    totalTeamVolume: v.number(),
    strongestLegAddress: v.string(),
    strongestLegVolume: v.number(),
    boosterRate: v.number(),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const addressLower = args.address.toLowerCase();
    const sponsorLower = args.sponsor.toLowerCase();
    
    const existing = await ctx.db
      .query("users")
      .withIndex("by_contract_address_address", (q) =>
        q.eq("contractAddress", contractLower).eq("address", addressLower)
      )
      .unique();
      
    const userData = {
      contractAddress: contractLower,
      address: addressLower,
      sponsor: sponsorLower,
      totalDeposits: args.totalDeposits,
      registrationTime: args.registrationTime,
      lastUpdateROI: args.lastUpdateROI,
      claimableBalance: args.claimableBalance,
      totalWithdrawn: args.totalWithdrawn,
      directCount: args.directCount,
      qualifiedDirectsCount: args.qualifiedDirectsCount,
      totalTeamCount: args.totalTeamCount,
      totalTeamVolume: args.totalTeamVolume,
      strongestLegAddress: args.strongestLegAddress.toLowerCase(),
      strongestLegVolume: args.strongestLegVolume,
      boosterRate: args.boosterRate,
      lastSynced: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, userData);
    } else {
      await ctx.db.insert("users", userData);
    }
    
    // Record referrals under this contractAddress scope
    if (sponsorLower !== "0x0000000000000000000000000000000000000000") {
      const existingRef = await ctx.db
        .query("referrals")
        .withIndex("by_contract_address_referral", (q) =>
          q.eq("contractAddress", contractLower).eq("referral", addressLower)
        )
        .unique();
      if (!existingRef) {
        await ctx.db.insert("referrals", {
          contractAddress: contractLower,
          sponsor: sponsorLower,
          referral: addressLower,
        });
      }
    }
  },
});

export const getUser = query({
  args: { contractAddress: v.string(), address: v.string() },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const addressLower = args.address.toLowerCase();
    return await ctx.db
      .query("users")
      .withIndex("by_contract_address_address", (q) =>
        q.eq("contractAddress", contractLower).eq("address", addressLower)
      )
      .unique();
  },
});

export const listDirectReferrals = query({
  args: { contractAddress: v.string(), address: v.string() },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const addressLower = args.address.toLowerCase();
    const refs = await ctx.db
      .query("referrals")
      .withIndex("by_contract_address_sponsor", (q) =>
        q.eq("contractAddress", contractLower).eq("sponsor", addressLower)
      )
      .collect();
    return refs.map(r => r.referral);
  },
});

export const getDownlineTree = query({
  args: { contractAddress: v.string(), address: v.string() },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const rootAddress = args.address.toLowerCase();
    
    const treeNodes = {};
    const queue = [rootAddress];
    const visited = new Set([rootAddress]);
    
    let depth = 0;
    while (queue.length > 0 && depth < 20) {
      const currentLevelSize = queue.length;
      for (let i = 0; i < currentLevelSize; i++) {
        const curr = queue.shift();
        
        const user = await ctx.db
          .query("users")
          .withIndex("by_contract_address_address", (q) =>
            q.eq("contractAddress", contractLower).eq("address", curr)
          )
          .unique();
          
        if (!user) continue;
        
        const refs = await ctx.db
          .query("referrals")
          .withIndex("by_contract_address_sponsor", (q) =>
            q.eq("contractAddress", contractLower).eq("sponsor", curr)
          )
          .collect();
        const children = refs.map(r => r.referral);

        const userDeps = await ctx.db
          .query("deposits")
          .withIndex("by_contract_address_user", (q) =>
            q.eq("contractAddress", contractLower).eq("user", curr)
          )
          .collect();
        
        treeNodes[curr] = {
          address: user.address,
          sponsor: user.sponsor,
          totalDeposits: user.totalDeposits.toFixed(2),
          registrationTime: user.registrationTime,
          lastUpdateROI: user.lastUpdateROI,
          directCount: user.directCount,
          qualifiedDirectsCount: user.qualifiedDirectsCount,
          totalTeamCount: user.totalTeamCount,
          totalTeamVolume: user.totalTeamVolume.toFixed(2),
          strongestLegAddress: user.strongestLegAddress,
          strongestLegVolume: user.strongestLegVolume.toFixed(2),
          boosterRate: user.boosterRate,
          children: children,
          deposits: userDeps.map(d => ({ amount: d.amount, timestamp: d.time })),
        };
        
        for (const child of children) {
          if (!visited.has(child)) {
            visited.add(child);
            queue.push(child);
          }
        }
      }
      depth++;
    }
    
    return treeNodes;
  },
});

export const dumpAllEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("onChainEvents").collect();
  }
});

export const dumpAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  }
});

export const checkTime = query({
  args: {},
  handler: async (ctx) => {
    return {
      dateNow: Date.now(),
      dateNowSeconds: Math.floor(Date.now() / 1000)
    };
  }
});

