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
  process.env.ANKR_API_KEY ? `https://rpc.ankr.com/bsc_testnet_chapel/${process.env.ANKR_API_KEY}` : "https://rpc.ankr.com/bsc_testnet_chapel",
  "https://bsc-testnet.public.blastapi.io",
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

async function getLogs(contractAddress, fromBlock, toBlock, userTopic) {
  const CHUNK = 2000; // safe chunk size to respect public RPC block range constraints
  const logs = [];
  for (let b = fromBlock; b <= toBlock; b += CHUNK) {
    const end = Math.min(b + CHUNK - 1, toBlock);
    const params = [{
      address: contractAddress.toLowerCase(),
      fromBlock: "0x" + b.toString(16),
      toBlock: "0x" + end.toString(16),
      topics: [null, userTopic] // Filter by userTopic on RPC server!
    }];
    const result = await rpcRequestWithFallback("eth_getLogs", params);
    if (Array.isArray(result)) logs.push(...result);
    // Small delay between chunks to avoid rate limits
    if (end < toBlock) await new Promise(r => setTimeout(r, 100));
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

    let startBlock = fromBlock;
    if (startBlock <= 0) {
      startBlock = Math.max(0, toBlock - 150000);
    }

    const events = [];

    try {
      const combinedTopics = [
        TOPICS.LevelIncomePaid,
        TOPICS.LevelROIPaid,
        TOPICS.PerformanceBonusClaimed,
        TOPICS.PerformanceDailyPaid,
        TOPICS.ROIAccumulated,
        TOPICS.BoosterROIAccumulated
      ];

      const allLogs = await getLogs(contract, startBlock, toBlock, userTopic);
      
      for (const log of allLogs) {
        if (!log.topics || log.topics.length === 0) continue;
        const topic0 = log.topics[0];
        
        // Only process the 6 income events
        if (!combinedTopics.includes(topic0)) continue;
        
        // The user must be the recipient (topics[1]) for all 6 of these events
        if (log.topics[1] !== userTopic) continue;
        
        const txHash = log.transactionHash.toLowerCase();
        const blockNumber = Number(log.blockNumber);
        const logIndex = Number(log.logIndex); // Unique index within the transaction
        const dataHex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        
        if (topic0 === TOPICS.LevelIncomePaid) {
          const downline = decodeAddress(log.topics[2]);
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
            txHash,
            blockNumber,
            isSimulated: false,
            logIndex,
          });
        } else if (topic0 === TOPICS.LevelROIPaid) {
          const downline = decodeAddress(log.topics[2]);
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
            txHash,
            blockNumber,
            isSimulated: false,
            logIndex,
          });
        } else if (topic0 === TOPICS.PerformanceBonusClaimed) {
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
            txHash,
            blockNumber,
            isSimulated: false,
            tierIndex,
            logIndex,
          });
        } else if (topic0 === TOPICS.PerformanceDailyPaid) {
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
            txHash,
            blockNumber,
            isSimulated: false,
            logIndex,
          });
        } else if (topic0 === TOPICS.ROIAccumulated) {
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
            txHash,
            blockNumber,
            isSimulated: false,
            logIndex,
          });
        } else if (topic0 === TOPICS.BoosterROIAccumulated) {
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
            txHash,
            blockNumber,
            isSimulated: false,
            logIndex,
          });
        }
      }
    } catch (e) {
      console.warn("fetchAndSyncLogs: Consolidated query failed:", e.message);
    }

    console.log(`fetchAndSyncLogs: fetched ${events.length} events for ${user}`);

    // Sync to the database (clears overlapping old blocks, inserts fresh)
    await ctx.runMutation(api.events.syncOnChainEvents, {
      contractAddress: contract,
      user,
      fromBlock,
      events,
    });

    return { count: events.length, success: true };
  },
});
