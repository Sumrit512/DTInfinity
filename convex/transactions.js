import { mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const syncDeposits = mutation({
  args: {
    contractAddress: v.string(),
    user: v.string(),
    deposits: v.array(v.object({
      amount: v.number(),
      time: v.number(),
      txHash: v.string(),
      actualTxHash: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const userLower = args.user.toLowerCase();

    const existingUserDeposits = await ctx.db
      .query("deposits")
      .withIndex("by_contract_address_user", (q) =>
        q.eq("contractAddress", contractLower).eq("user", userLower)
      )
      .collect();

    // Clean up any corrupt/malformed deposits for this user (amount < 0.01 or time > 2000000000)
    for (const doc of existingUserDeposits) {
      if (doc.amount < 0.01 || doc.time > 2000000000 || doc.time === 0) {
        await ctx.db.delete(doc._id);
      }
    }

    // Re-query clean existing deposits
    const cleanUserDeposits = await ctx.db
      .query("deposits")
      .withIndex("by_contract_address_user", (q) =>
        q.eq("contractAddress", contractLower).eq("user", userLower)
      )
      .collect();

    const missingDeposits = [];

    for (const dep of args.deposits) {
      if (dep.amount < 0.01 || dep.time > 2000000000 || dep.time === 0) continue;
      const txHashLower = dep.txHash.toLowerCase();
      const actualHashLower = dep.actualTxHash ? dep.actualTxHash.toLowerCase() : undefined;

      const existing = cleanUserDeposits.find(e => 
        e.txHash.toLowerCase() === txHashLower ||
        (actualHashLower && e.actualTxHash && e.actualTxHash.toLowerCase() === actualHashLower) ||
        (Math.abs(e.time - dep.time) < 10 && Math.abs(e.amount - dep.amount) < 0.01)
      );

      if (existing) {
        if (actualHashLower && !existing.actualTxHash) {
          await ctx.db.patch(existing._id, { actualTxHash: actualHashLower });
        }
      } else {
        missingDeposits.push({
          contractAddress: contractLower,
          user: userLower,
          amount: dep.amount,
          time: dep.time,
          txHash: txHashLower,
          actualTxHash: actualHashLower,
        });
      }
    }

    missingDeposits.sort((a, b) => a.time - b.time);

    for (const depDoc of missingDeposits) {
      await ctx.db.insert("deposits", depDoc);
    }
  },
});

export const syncWithdrawals = mutation({
  args: {
    contractAddress: v.string(),
    user: v.string(),
    withdrawals: v.array(v.object({
      amount: v.number(),
      time: v.number(),
      txHash: v.string(),
      actualTxHash: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const contractLower = args.contractAddress.toLowerCase();
    const userLower = args.user.toLowerCase();

    // Query existing withdrawals for this user in Convex DB (Source of Truth)
    const existingUserWithdrawals = await ctx.db
      .query("withdrawals")
      .withIndex("by_contract_address_user", (q) =>
        q.eq("contractAddress", contractLower).eq("user", userLower)
      )
      .collect();

    const missingWithdrawals = [];

    for (const w of args.withdrawals) {
      const txHashLower = w.txHash.toLowerCase();
      const actualHashLower = w.actualTxHash ? w.actualTxHash.toLowerCase() : undefined;

      // Check if withdrawal already exists in Convex DB
      const existing = existingUserWithdrawals.find(e => 
        e.txHash.toLowerCase() === txHashLower ||
        (actualHashLower && e.actualTxHash && e.actualTxHash.toLowerCase() === actualHashLower) ||
        (Math.abs(e.time - w.time) < 10 && Math.abs(e.amount - w.amount) < 0.01)
      );

      if (existing) {
        if (actualHashLower && !existing.actualTxHash) {
          await ctx.db.patch(existing._id, { actualTxHash: actualHashLower });
        }
      } else {
        missingWithdrawals.push({
          contractAddress: contractLower,
          user: userLower,
          amount: w.amount,
          time: w.time,
          txHash: txHashLower,
          actualTxHash: actualHashLower,
        });
      }
    }

    // Sort missing withdrawals chronologically ascending
    missingWithdrawals.sort((a, b) => a.time - b.time);

    for (const wDoc of missingWithdrawals) {
      await ctx.db.insert("withdrawals", wDoc);
    }
  },
});

export const syncMissedTx = action({
  args: {
    txHash: v.string(),
    dtInfinityAddress: v.string(),
    rpcUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rpc = args.rpcUrl || "https://data-seed-prebsc-1-s1.binance.org:8545";
    const txHash = args.txHash.toLowerCase();
    const dtInfinityAddress = args.dtInfinityAddress.toLowerCase();
    
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider(rpc);
    
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        throw new Error("Transaction receipt not found on RPC provider.");
      }
      
      if (receipt.to.toLowerCase() !== dtInfinityAddress) {
        throw new Error("Transaction recipient was not the DTInfinity contract.");
      }

      const iface = new ethers.Interface([
        "event Deposited(address indexed user, uint256 amount, uint256 time)",
        "event Withdrawn(address indexed user, uint256 amount, uint256 time)",
        "event PerformanceBonusClaimed(address indexed user, uint256 tierIndex, bool chooseInstant, uint256 time)"
      ]);

      let type = null;
      let user = null;
      let amount = 0;
      let time = Math.floor(Date.now() / 1000);
      let tierIndex = undefined;
      let chooseInstant = false;

      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed) {
            if (parsed.name === "Deposited") {
              type = "deposit";
              user = parsed.args.user.toLowerCase();
              amount = parseFloat(ethers.formatUnits(parsed.args.amount, 18));
              time = Number(parsed.args.time);
              break;
            } else if (parsed.name === "Withdrawn") {
              type = "withdraw";
              user = parsed.args.user.toLowerCase();
              amount = parseFloat(ethers.formatUnits(parsed.args.amount, 18));
              time = Number(parsed.args.time);
              break;
            } else if (parsed.name === "PerformanceBonusClaimed") {
              type = "perf_claim";
              user = parsed.args.user.toLowerCase();
              tierIndex = Number(parsed.args.tierIndex);
              chooseInstant = parsed.args.chooseInstant;
              time = Number(parsed.args.time);
              break;
            }
          }
        } catch (e) {
          // Skip unmatching logs
        }
      }

      if (!type || !user) {
        throw new Error("Could not parse supported DTInfinity events from receipt logs.");
      }

      // Fetch user profile state & transaction lists on-chain to do mapping
      const dtContractInstance = new ethers.Contract(dtInfinityAddress, [
        "function getUserBasicInfo(address user) external view returns (address sponsor, uint256 totalDeposits, uint256 registrationTime, uint256 lastUpdateROI, uint256 claimableBalance, uint256 totalWithdrawn)",
        "function getUserNetworkInfo(address user) external view returns (uint256 directCount, uint256 qualifiedDirectsCount, uint256 totalTeamCount, uint256 totalTeamVolume, address strongestLegAddress, uint256 strongestLegVolume)",
        "function getBoosterRate(address userAddr) external view returns (uint256)",
        "function getUserDeposits(address userAddr) external view returns (tuple(uint256 amount, uint256 time, uint256 lastUpdateROI, uint256 dailyROIEarned, uint256 roiBoosterEarned, uint256 rateBps, bool isFirstDeposit)[])",
        "function getUserWithdrawals(address userAddr) external view returns (tuple(uint256 amount, uint256 time)[])"
      ], provider);

      // Deduplicate and sync transactions to Convex DB
      if (type === "deposit") {
        const userDeposits = await dtContractInstance.getUserDeposits(user);
        let matchIdx = -1;
        for (let i = 0; i < userDeposits.length; i++) {
          const depAmt = parseFloat(ethers.formatUnits(userDeposits[i].amount, 18));
          const depTime = Number(userDeposits[i].time);
          if (Math.abs(depAmt - amount) < 0.01 && Math.abs(depTime - time) < 10) {
            matchIdx = i;
            break;
          }
        }
        
        if (matchIdx === -1) {
          throw new Error("Could not locate matching deposit record in contract state.");
        }

        const uniqueTxHash = `0x_dep_${user}_${matchIdx}_${time}`;
        await ctx.runMutation(api.transactions.syncDeposits, {
          contractAddress: dtInfinityAddress,
          user,
          deposits: [{
            amount,
            time,
            txHash: uniqueTxHash,
            actualTxHash: txHash,
          }],
        });
      } else if (type === "withdraw") {
        const userWithdrawals = await dtContractInstance.getUserWithdrawals(user);
        let matchIdx = -1;
        for (let i = 0; i < userWithdrawals.length; i++) {
          const withAmt = parseFloat(ethers.formatUnits(userWithdrawals[i].amount, 18));
          const withTime = Number(userWithdrawals[i].time);
          if (Math.abs(withAmt - amount) < 0.01 && Math.abs(withTime - time) < 10) {
            matchIdx = i;
            break;
          }
        }
        
        if (matchIdx === -1) {
          throw new Error("Could not locate matching withdrawal record in contract state.");
        }

        const uniqueTxHash = `0x_with_${user}_${matchIdx}_${time}`;
        await ctx.runMutation(api.transactions.syncWithdrawals, {
          contractAddress: dtInfinityAddress,
          user,
          withdrawals: [{
            amount,
            time,
            txHash: uniqueTxHash,
            actualTxHash: txHash,
          }],
        });
      } else if (type === "perf_claim") {
        const PERFORMANCE_TIERS = [75, 150, 375, 750, 2250, 7500];
        const instantReward = chooseInstant ? PERFORMANCE_TIERS[tierIndex] : 0;
        
        await ctx.runMutation(api.events.syncOnChainEvents, {
          contractAddress: dtInfinityAddress,
          user,
          events: [{
            type: chooseInstant ? "perf_instant" : "perf_claim",
            typeName: chooseInstant ? "Performance Bonus (Instant)" : "Performance Bonus Claimed",
            fromUser: "Contract",
            amount: instantReward,
            level: "-",
            timestamp: time,
            status: "Completed",
            txHash,
            blockNumber: receipt.blockNumber,
            isSimulated: false,
            tierIndex,
          }]
        });
      }

      // Sync user profile state
      const [basicInfo, networkInfo, boosterRate] = await Promise.all([
        dtContractInstance.getUserBasicInfo(user),
        dtContractInstance.getUserNetworkInfo(user),
        dtContractInstance.getBoosterRate(user)
      ]);

      await ctx.runMutation(api.users.upsertUser, {
        contractAddress: dtInfinityAddress,
        address: user,
        sponsor: basicInfo.sponsor.toLowerCase(),
        totalDeposits: parseFloat(ethers.formatUnits(basicInfo.totalDeposits, 18)),
        registrationTime: Number(basicInfo.registrationTime),
        lastUpdateROI: Number(basicInfo.lastUpdateROI),
        claimableBalance: parseFloat(ethers.formatUnits(basicInfo.claimableBalance, 18)),
        totalWithdrawn: parseFloat(ethers.formatUnits(basicInfo.totalWithdrawn, 18)),
        directCount: Number(networkInfo.directCount),
        qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount),
        totalTeamCount: Number(networkInfo.totalTeamCount),
        totalTeamVolume: parseFloat(ethers.formatUnits(networkInfo.totalTeamVolume, 18)),
        strongestLegAddress: networkInfo.strongestLegAddress.toLowerCase(),
        strongestLegVolume: parseFloat(ethers.formatUnits(networkInfo.strongestLegVolume, 18)),
        boosterRate: Number(boosterRate) / 100,
      });

      return { success: true, type, user, amount, timestamp: time };
    } catch (err) {
      console.error("Missed transaction sync action failed", err);
      return { success: false, error: err.message };
    }
  },
});
