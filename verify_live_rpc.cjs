const { ethers } = require("ethers");

const RPC_URLS = [
  "https://bsc-testnet-rpc.publicnode.com",
  "https://rpc.ankr.com/bsc_testnet_chapel",
  "https://data-seed-prebsc-1-s1.binance.org:8545",
  "https://endpoints.omniatech.io/v1/bsc/testnet/public"
];

const CONTRACT_ADDRESS = "0xD00c01EE56C3695976721043Ca18FaA1c0df9107";
const WALLET_ADDRESS = "0x9f0F8CF78C9de367Fff625ad358059516F38017b";

const DT_INFINITY_ABI = [
  "event Registered(address indexed user, address indexed sponsor, uint256 time)",
  "event Deposited(address indexed user, uint256 amount, uint256 time)",
  "event Withdrawn(address indexed user, uint256 amount, uint256 time)",
  "event LevelIncomePaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)",
  "event LevelROIPaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)",
  "event PerformanceBonusAchieved(address indexed user, uint256 tierIndex, uint256 instantReward, uint256 time)",
  "event PerformanceBonusClaimed(address indexed user, uint256 tierIndex, bool chooseInstant, uint256 processedTime, uint256 streamStartTime, uint256 streamEndTime, uint256 dailyRate)",
  "event ROIAccumulated(address indexed user, uint256 amount, uint256 time)",
  "event BoosterROIAccumulated(address indexed user, uint256 amount, uint256 time)",
  "event PerformanceDailyPaid(address indexed user, uint256 amount, uint256 time)",
  "function getUserBasicInfo(address user) external view returns (address sponsor, uint256 totalDeposits, uint256 registrationTime, uint256 lastUpdateROI, uint256 claimableBalance, uint256 totalWithdrawn)",
  "function getUserIncomeInfo(address user) external view returns (uint256 dailyROIEarned, uint256 roiBoosterEarned, uint256 levelIncomeEarned, uint256 levelROIEarned, uint256 performanceBonusEarned)",
  "function getActiveBonuses(address user) external view returns (tuple(uint256 startTime, uint256 lastClaimTime, uint256 dailyRate, uint256 endTime)[])"
];

async function executeLiveVerification() {
  let provider;
  for (const url of RPC_URLS) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      provider = p;
      console.log(`[LIVE RPC] Connected to Provider: ${url}`);
      break;
    } catch (e) {
      console.warn(`[LIVE RPC] Provider ${url} failed: ${e.message}`);
    }
  }

  if (!provider) {
    console.error("Failed to connect to any RPC provider");
    process.exit(1);
  }

  const latestBlock = await provider.getBlockNumber();
  console.log(`[LIVE RPC] Latest Block Number: ${latestBlock}`);

  const contract = new ethers.Contract(CONTRACT_ADDRESS, DT_INFINITY_ABI, provider);

  const basicInfo = await contract.getUserBasicInfo(WALLET_ADDRESS);
  const regTime = Number(basicInfo.registrationTime);
  console.log(`[LIVE CONTRACT] Wallet Registration Time: ${regTime} (${new Date(regTime * 1000).toISOString()})`);

  // Target window: past 40,000 blocks (~33 hours on BSC Testnet, covering registration & all activity)
  const startBlock = Math.max(0, latestBlock - 40000);
  const chunkSize = 5000;

  console.log(`\n=== STEP 1 & 2: QUERYING PerformanceBonusClaimed AND PerformanceDailyPaid FROM BLOCK ${startBlock} TO ${latestBlock} ===`);

  const claimedFilter = contract.filters.PerformanceBonusClaimed(WALLET_ADDRESS);
  const dailyPaidFilter = contract.filters.PerformanceDailyPaid(WALLET_ADDRESS);

  const rawClaimedLogs = [];
  const rawDailyPaidLogs = [];

  for (let from = startBlock; from <= latestBlock; from += chunkSize) {
    const to = Math.min(latestBlock, from + chunkSize - 1);
    try {
      const cLogs = await contract.queryFilter(claimedFilter, from, to);
      if (cLogs.length > 0) rawClaimedLogs.push(...cLogs);

      const dLogs = await contract.queryFilter(dailyPaidFilter, from, to);
      if (dLogs.length > 0) rawDailyPaidLogs.push(...dLogs);
    } catch (err) {
      console.warn(`Chunk ${from}-${to} query warning: ${err.message}`);
    }
  }

  console.log("\nRAW RPC RESPONSE for PerformanceBonusClaimed:");
  console.log(JSON.stringify(rawClaimedLogs, null, 2));

  console.log("\nRAW RPC RESPONSE for PerformanceDailyPaid:");
  console.log(JSON.stringify(rawDailyPaidLogs, null, 2));

  console.log(`\n=== STEP 3: DECODING RETURNED EVENTS ===`);

  const decodedClaimedEvents = [];
  for (let i = 0; i < rawClaimedLogs.length; i++) {
    const ev = rawClaimedLogs[i];
    const block = await provider.getBlock(ev.blockNumber);
    decodedClaimedEvents.push({
      eventName: "PerformanceBonusClaimed",
      transactionHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index !== undefined ? ev.index : ev.logIndex,
      blockTimestamp: block ? block.timestamp : 0,
      user: ev.args.user,
      tierIndex: ev.args.tierIndex.toString(),
      chooseInstant: ev.args.chooseInstant,
      processedTime: ev.args.processedTime ? ev.args.processedTime.toString() : "0",
      streamStartTime: ev.args.streamStartTime ? ev.args.streamStartTime.toString() : "0",
      streamEndTime: ev.args.streamEndTime ? ev.args.streamEndTime.toString() : "0",
      dailyRate: ev.args.dailyRate ? ev.args.dailyRate.toString() : "0"
    });
  }

  const decodedDailyPaidEvents = [];
  for (let i = 0; i < rawDailyPaidLogs.length; i++) {
    const ev = rawDailyPaidLogs[i];
    const block = await provider.getBlock(ev.blockNumber);
    decodedDailyPaidEvents.push({
      eventName: "PerformanceDailyPaid",
      transactionHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: ev.index !== undefined ? ev.index : ev.logIndex,
      blockTimestamp: block ? block.timestamp : 0,
      user: ev.args.user,
      amount: ethers.formatUnits(ev.args.amount, 18),
      timestamp: ev.args.time ? ev.args.time.toString() : "0"
    });
  }

  console.log("DECODED PerformanceBonusClaimed EVENTS:");
  console.log(JSON.stringify(decodedClaimedEvents, null, 2));

  console.log("DECODED PerformanceDailyPaid EVENTS:");
  console.log(JSON.stringify(decodedDailyPaidEvents, null, 2));

  console.log(`\n=== STEP 4: CROSS CHECK AGAINST CONTRACT STORAGE ===`);
  const incomeInfo = await contract.getUserIncomeInfo(WALLET_ADDRESS);
  const activeBonuses = await contract.getActiveBonuses(WALLET_ADDRESS);

  console.log("getUserIncomeInfo.performanceBonusEarned:", ethers.formatUnits(incomeInfo.performanceBonusEarned, 18), "USDT");
  console.log("getUserBasicInfo.claimableBalance:", ethers.formatUnits(basicInfo.claimableBalance, 18), "USDT");
  console.log("getActiveBonuses length:", activeBonuses.length);
  console.log("getActiveBonuses raw array:", activeBonuses);

  console.log(`\n=== STEP 6: UNFILTERED SEARCH (ALL PerformanceBonusClaimed AND PerformanceDailyPaid EVENTS) ===`);
  const unfilteredClaimedLogs = [];
  const unfilteredDailyPaidLogs = [];

  const unfilterClaimed = contract.filters.PerformanceBonusClaimed();
  const unfilterDaily = contract.filters.PerformanceDailyPaid();

  for (let from = startBlock; from <= latestBlock; from += chunkSize) {
    const to = Math.min(latestBlock, from + chunkSize - 1);
    try {
      const uC = await contract.queryFilter(unfilterClaimed, from, to);
      if (uC.length > 0) unfilteredClaimedLogs.push(...uC);

      const uD = await contract.queryFilter(unfilterDaily, from, to);
      if (uD.length > 0) unfilteredDailyPaidLogs.push(...uD);
    } catch (err) { }
  }

  console.log(`Total Unfiltered PerformanceBonusClaimed Events (All Users): ${unfilteredClaimedLogs.length}`);
  console.log(`Total Unfiltered PerformanceDailyPaid Events (All Users): ${unfilteredDailyPaidLogs.length}`);

  const userMatchedUnfilteredClaimed = unfilteredClaimedLogs.filter(e => e.args && e.args.user && e.args.user.toLowerCase() === WALLET_ADDRESS.toLowerCase());
  const userMatchedUnfilteredDaily = unfilteredDailyPaidLogs.filter(e => e.args && e.args.user && e.args.user.toLowerCase() === WALLET_ADDRESS.toLowerCase());

  console.log(`Manually Filtered PerformanceBonusClaimed for ${WALLET_ADDRESS}: ${userMatchedUnfilteredClaimed.length}`);
  console.log(`Manually Filtered PerformanceDailyPaid for ${WALLET_ADDRESS}: ${userMatchedUnfilteredDaily.length}`);

  if (userMatchedUnfilteredClaimed.length > 0) {
    console.log("Unfiltered Matched PerformanceBonusClaimed:", JSON.stringify(userMatchedUnfilteredClaimed.map(e => ({
      txHash: e.transactionHash, blockNumber: e.blockNumber, user: e.args.user, tierIndex: e.args.tierIndex.toString(), chooseInstant: e.args.chooseInstant
    })), null, 2));
  }

  if (userMatchedUnfilteredDaily.length > 0) {
    console.log("Unfiltered Matched PerformanceDailyPaid:", JSON.stringify(userMatchedUnfilteredDaily.map(e => ({
      txHash: e.transactionHash, blockNumber: e.blockNumber, user: e.args.user, amount: ethers.formatUnits(e.args.amount, 18)
    })), null, 2));
  }
}

executeLiveVerification().catch(err => console.error("Live Verification Error:", err));
