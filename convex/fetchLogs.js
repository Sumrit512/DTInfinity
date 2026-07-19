import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

// Event topic hashes — keccak256 of each event signature from DTInfinity.sol
const TOPICS = {
  LevelIncomePaid:         "0xdd307d5e1c013c07f78905a4ce909ed967697858cb4f7b19e6bb5ad6eeed0c8a",
  LevelROIPaid:            "0x0ca78596afc0b84b1b3f7880006c32334ce9c9f16daed0c15d7d5f40d2d53379",
  PerformanceBonusClaimed: "0xc449e361b5bcd7d2368c7c5ff086a2629d9608219aa530908e3ffca720994997",
  PerformanceDailyPaid:    "0xf8eedbffac303aba80228ed5f65ee990691376de3aa6ec4d925d156d4243677b",
  ROIAccumulated:          "0xe169e93250510eb542283eb4475024a2697088c458589105e2293013446d5ce2",
  BoosterROIAccumulated:   "0xfab43346c131db806194631ab6869e03ac6353295532967db4e0f925c0ab55b6",
};

const BSC_TESTNET_RPCS = [
  "https://data-seed-prebsc-1-s1.binance.org:8545",
  "https://data-seed-prebsc-2-s1.binance.org:8545",
  "https://data-seed-prebsc-1-s2.binance.org:8545",
  "https://data-seed-prebsc-2-s2.binance.org:8545",
  "https://data-seed-prebsc-1-s3.binance.org:8545",
];

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

async function rpcRequestWithFallback(method, params) {
  let lastErr;
  for (const rpc of BSC_TESTNET_RPCS) {
    try {
      return await rpcRequest(rpc, method, params);
    } catch (e) {
      lastErr = e;
      // Small delay before trying next RPC
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw lastErr;
}

// Pad a hex address to 32-byte topic format
function addrToTopic(addr) {
  return "0x000000000000000000000000" + addr.toLowerCase().slice(2);
}

// Decode a uint256 from a 32-byte hex string
function decodeUint256(hex) {
  return BigInt("0x" + hex.slice(-64));
}

// Decode an address from a 32-byte hex string
function decodeAddress(hex) {
  return "0x" + hex.slice(-40).toLowerCase();
}

async function getLogs(contractAddress, fromBlock, toBlock, topic0, topic1) {
  const CHUNK = 2000; // safe chunk for BSC Testnet
  const logs = [];
  for (let b = fromBlock; b <= toBlock; b += CHUNK) {
    const end = Math.min(b + CHUNK - 1, toBlock);
    const params = [{
      address: contractAddress.toLowerCase(),
      fromBlock: "0x" + b.toString(16),
      toBlock: "0x" + end.toString(16),
      topics: topic1 ? [topic0, topic1] : [topic0],
    }];
    const result = await rpcRequestWithFallback("eth_getLogs", params);
    if (Array.isArray(result)) logs.push(...result);
    // Small delay between chunks to avoid rate limits
    if (end < toBlock) await new Promise(r => setTimeout(r, 400));
  }
  return logs;
}

export const fetchAndSyncLogs = action({
  args: {
    contractAddress: v.string(),
    userAddress: v.string(),
    fromBlock: v.number(),
    toBlock: v.number(),
    perfTiers: v.optional(v.array(v.object({
      instant: v.number(),
      daily: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const contract = args.contractAddress.toLowerCase();
    const user = args.userAddress.toLowerCase();
    const userTopic = addrToTopic(user);
    const { fromBlock, toBlock } = args;
    const perfTiers = args.perfTiers || [
      { instant: 75, daily: 2.5 },
      { instant: 150, daily: 5 },
      { instant: 300, daily: 10 },
      { instant: 600, daily: 20 },
      { instant: 1500, daily: 50 },
    ];

    const events = [];

    try {
      // 1. LevelIncomePaid (upline=user indexed)
      const levelIncomeLogs = await getLogs(contract, fromBlock, toBlock, TOPICS.LevelIncomePaid, userTopic);
      // topics: [topic0, upline(indexed), downline(indexed)]
      // data: level(32) + amount(32) + time(32)
      for (const log of levelIncomeLogs) {
        const downline = decodeAddress(log.topics[2]);
        const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        const level   = Number(decodeUint256(dataHex.slice(0, 64)));
        const amount  = Number(decodeUint256(dataHex.slice(64, 128))) / 1e18;
        const time    = Number(decodeUint256(dataHex.slice(128, 192)));
        events.push({
          type: "level_income",
          typeName: "Level Income",
          fromUser: downline,
          amount,
          level: level.toString(),
          timestamp: time,
          status: "Completed",
          txHash: log.transactionHash.toLowerCase(),
          blockNumber: Number(log.blockNumber),
          isSimulated: false,
        });
      }
    } catch (e) {
      console.warn("fetchAndSyncLogs: LevelIncomePaid query failed:", e.message);
    }

    await new Promise(r => setTimeout(r, 500));

    try {
      // 2. LevelROIPaid (upline=user indexed)
      const levelROILogs = await getLogs(contract, fromBlock, toBlock, TOPICS.LevelROIPaid, userTopic);
      // topics: [topic0, upline(indexed), downline(indexed)]
      // data: level(32) + amount(32) + time(32)
      for (const log of levelROILogs) {
        const downline = decodeAddress(log.topics[2]);
        const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        const level   = Number(decodeUint256(dataHex.slice(0, 64)));
        const amount  = Number(decodeUint256(dataHex.slice(64, 128))) / 1e18;
        const time    = Number(decodeUint256(dataHex.slice(128, 192)));
        events.push({
          type: "level_roi",
          typeName: "Level ROI Matching",
          fromUser: downline,
          amount,
          level: level.toString(),
          timestamp: time,
          status: "Completed",
          txHash: log.transactionHash.toLowerCase(),
          blockNumber: Number(log.blockNumber),
          isSimulated: false,
        });
      }
    } catch (e) {
      console.warn("fetchAndSyncLogs: LevelROIPaid query failed:", e.message);
    }

    await new Promise(r => setTimeout(r, 500));

    try {
      // 3. PerformanceBonusClaimed (user indexed)
      const perfClaimedLogs = await getLogs(contract, fromBlock, toBlock, TOPICS.PerformanceBonusClaimed, userTopic);
      // topics: [topic0, user(indexed)]
      // data: tierIndex(32) + chooseInstant(32 as bool) + time(32)
      for (const log of perfClaimedLogs) {
        const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        const tierIndex    = Number(decodeUint256(dataHex.slice(0, 64)));
        const chooseInstant = Number(decodeUint256(dataHex.slice(64, 128))) !== 0;
        const time         = Number(decodeUint256(dataHex.slice(128, 192)));
        const tier = perfTiers[tierIndex] || { instant: 0, daily: 0 };
        events.push({
          type: chooseInstant ? "perf_instant" : "perf_claim",
          typeName: chooseInstant ? "Performance Bonus (Instant)" : "Performance Bonus Claimed",
          fromUser: "contract",
          amount: chooseInstant ? tier.instant : 0,
          level: "-",
          timestamp: time,
          status: "Completed",
          txHash: log.transactionHash.toLowerCase(),
          blockNumber: Number(log.blockNumber),
          isSimulated: false,
          tierIndex,
        });
      }
    } catch (e) {
      console.warn("fetchAndSyncLogs: PerformanceBonusClaimed query failed:", e.message);
    }

    await new Promise(r => setTimeout(r, 500));

    try {
      // 4. PerformanceDailyPaid (user indexed)
      const perfDailyLogs = await getLogs(contract, fromBlock, toBlock, TOPICS.PerformanceDailyPaid, userTopic);
      // topics: [topic0, user(indexed)] — data: amount(32) + time(32)
      for (const log of perfDailyLogs) {
        const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        const amount = Number(decodeUint256(dataHex.slice(0, 64))) / 1e18;
        const time   = Number(decodeUint256(dataHex.slice(64, 128)));
        events.push({
          type: "perf_daily",
          typeName: "Performance Daily Salary",
          fromUser: "contract",
          amount,
          level: "-",
          timestamp: time,
          status: "Completed",
          txHash: log.transactionHash.toLowerCase(),
          blockNumber: Number(log.blockNumber),
          isSimulated: false,
        });
      }
    } catch (e) {
      console.warn("fetchAndSyncLogs: PerformanceDailyPaid query failed:", e.message);
    }

    await new Promise(r => setTimeout(r, 500));

    try {
      // 5. ROIAccumulated (user indexed)
      const roiLogs = await getLogs(contract, fromBlock, toBlock, TOPICS.ROIAccumulated, userTopic);
      // topics: [topic0, user(indexed)] — data: amount(32) + time(32)
      for (const log of roiLogs) {
        const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        const amount = Number(decodeUint256(dataHex.slice(0, 64))) / 1e18;
        const time   = Number(decodeUint256(dataHex.slice(64, 128)));
        events.push({
          type: "roi",
          typeName: "Daily ROI Payout",
          fromUser: "contract",
          amount,
          level: "-",
          timestamp: time,
          status: "Completed",
          txHash: log.transactionHash.toLowerCase(),
          blockNumber: Number(log.blockNumber),
          isSimulated: false,
        });
      }
    } catch (e) {
      console.warn("fetchAndSyncLogs: ROIAccumulated query failed:", e.message);
    }

    await new Promise(r => setTimeout(r, 500));

    try {
      // 6. BoosterROIAccumulated (user indexed)
      const boosterLogs = await getLogs(contract, fromBlock, toBlock, TOPICS.BoosterROIAccumulated, userTopic);
      // topics: [topic0, user(indexed)] — data: amount(32) + time(32)
      for (const log of boosterLogs) {
        const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        const amount = Number(decodeUint256(dataHex.slice(0, 64))) / 1e18;
        const time   = Number(decodeUint256(dataHex.slice(64, 128)));
        events.push({
          type: "booster_roi",
          typeName: "Booster ROI Payout",
          fromUser: "contract",
          amount,
          level: "-",
          timestamp: time,
          status: "Completed",
          txHash: log.transactionHash.toLowerCase(),
          blockNumber: Number(log.blockNumber),
          isSimulated: false,
        });
      }
    } catch (e) {
      console.warn("fetchAndSyncLogs: BoosterROIAccumulated query failed:", e.message);
    }

    console.log(`fetchAndSyncLogs: fetched ${events.length} events for ${user}`);

    // Sync to the database (clears old, inserts fresh)
    if (events.length > 0) {
      await ctx.runMutation(api.events.syncOnChainEvents, {
        contractAddress: contract,
        user,
        events,
      });
    }

    return { count: events.length, success: true };
  },
});
