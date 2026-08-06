const { ethers } = require('ethers');
const { execSync } = require('child_process');

const CONTRACT_ADDRESS = '0x386bf453c7cb46908f3635A939d3f3b918dabA4E';
const RPC_URL = 'https://bsc-testnet-rpc.publicnode.com';
const CHUNK_SIZE = 2000;

const ABI = [
  'event Registered(address indexed user, address indexed sponsor, uint256 time)',
  'event Deposited(address indexed user, uint256 amount, uint256 time)',
  'event LevelIncomePaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)',
  'event LevelROIPaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)',
  'event PerformanceBonusAchieved(address indexed user, uint256 tierIndex, uint256 instantReward, uint256 time)',
  'event Withdrawn(address indexed user, uint256 amount, uint256 time)',
  'event PerformanceBonusClaimed(address indexed user, uint256 tierIndex, bool chooseInstant, uint256 processedTime, uint256 streamStartTime, uint256 streamEndTime, uint256 dailyRate)',
  'event ROIAccumulated(address indexed user, uint256 amount, uint256 time)',
  'event BoosterROIAccumulated(address indexed user, uint256 amount, uint256 time)',
  'event PerformanceDailyPaid(address indexed user, uint256 amount, uint256 time)'
];

const PERFORMANCE_TIERS = [
  { target: 1500, instant: 75, daily: 5 },
  { target: 3500, instant: 150, daily: 10 },
  { target: 7500, instant: 375, daily: 25 },
  { target: 12500, instant: 750, daily: 50 },
  { target: 25000, instant: 2250, daily: 150 },
  { target: 75000, instant: 7500, daily: 500 }
];

async function queryFilterInChunks(contract, eventName, startBlock, endBlock) {
  let allEvents = [];
  let currentStart = startBlock;
  
  while (currentStart <= endBlock) {
    const currentEnd = Math.min(currentStart + CHUNK_SIZE, endBlock);
    console.log(`Querying ${eventName} from block ${currentStart} to ${currentEnd}...`);
    try {
      const events = await contract.queryFilter(eventName, currentStart, currentEnd);
      allEvents = allEvents.concat(events);
    } catch (e) {
      console.warn(`Error querying ${eventName} from block ${currentStart} to ${currentEnd}:`, e.message);
    }
    currentStart = currentEnd + 1;
  }
  return allEvents;
}

async function main() {
  console.log('Connecting to RPC URL:', RPC_URL);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const currentBlock = await provider.getBlockNumber();
  console.log('Current Block:', currentBlock);

  // Set start block to 9,000 blocks ago to bypass BSC Testnet public node log pruning
  const START_BLOCK = currentBlock - 9000;
  console.log(`Querying logs from block ${START_BLOCK} to ${currentBlock}...`);

  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  const eventsMap = {}; // user -> list of events
  const depositsMap = {}; // user -> list of deposits
  const withdrawalsMap = {}; // user -> list of withdrawals

  function getEventsList(user) {
    const k = user.toLowerCase();
    if (!eventsMap[k]) eventsMap[k] = [];
    return eventsMap[k];
  }

  function getDepositsList(user) {
    const k = user.toLowerCase();
    if (!depositsMap[k]) depositsMap[k] = [];
    return depositsMap[k];
  }

  function getWithdrawalsList(user) {
    const k = user.toLowerCase();
    if (!withdrawalsMap[k]) withdrawalsMap[k] = [];
    return withdrawalsMap[k];
  }

  // 1. Query Deposited Events
  const depEvents = await queryFilterInChunks(contract, 'Deposited', START_BLOCK, currentBlock);
  console.log(`Found ${depEvents.length} Deposited events.`);
  for (const event of depEvents) {
    const args = event.args;
    const user = args.user.toLowerCase();
    const amount = parseFloat(ethers.formatUnits(args.amount, 18));
    const time = Number(args.time);
    const txHash = event.transactionHash.toLowerCase();
    
    getDepositsList(user).push({
      amount,
      time,
      txHash: `0x_dep_${user}_${time}`,
      actualTxHash: txHash
    });
  }

  // 2. Query Withdrawn Events
  const withEvents = await queryFilterInChunks(contract, 'Withdrawn', START_BLOCK, currentBlock);
  console.log(`Found ${withEvents.length} Withdrawn events.`);
  for (const event of withEvents) {
    const args = event.args;
    const user = args.user.toLowerCase();
    const amount = parseFloat(ethers.formatUnits(args.amount, 18));
    const time = Number(args.time);
    const txHash = event.transactionHash.toLowerCase();

    getWithdrawalsList(user).push({
      amount,
      time,
      txHash: `0x_with_${user}_${time}`,
      actualTxHash: txHash
    });
  }

  // 3. LevelIncomePaid
  const levelIncomeEvents = await queryFilterInChunks(contract, 'LevelIncomePaid', START_BLOCK, currentBlock);
  console.log(`Found ${levelIncomeEvents.length} LevelIncomePaid events.`);
  for (const event of levelIncomeEvents) {
    const args = event.args;
    const user = args.upline.toLowerCase();
    getEventsList(user).push({
      type: 'level_income',
      typeName: 'Level Income',
      fromUser: args.downline.toLowerCase(),
      amount: parseFloat(ethers.formatUnits(args.amount, 18)),
      level: args.level.toString(),
      timestamp: Number(args.time),
      status: 'Completed',
      txHash: event.transactionHash.toLowerCase(),
      blockNumber: event.blockNumber,
      isSimulated: false,
      logIndex: event.index
    });
  }

  // 4. LevelROIPaid
  const levelRoiEvents = await queryFilterInChunks(contract, 'LevelROIPaid', START_BLOCK, currentBlock);
  console.log(`Found ${levelRoiEvents.length} LevelROIPaid events.`);
  for (const event of levelRoiEvents) {
    const args = event.args;
    const user = args.upline.toLowerCase();
    getEventsList(user).push({
      type: 'level_roi',
      typeName: 'Level ROI Matching',
      fromUser: args.downline.toLowerCase(),
      amount: parseFloat(ethers.formatUnits(args.amount, 18)),
      level: args.level.toString(),
      timestamp: Number(args.time),
      status: 'Completed',
      txHash: event.transactionHash.toLowerCase(),
      blockNumber: event.blockNumber,
      isSimulated: false,
      logIndex: event.index
    });
  }

  // 5. PerformanceBonusClaimed
  const perfClaimedEvents = await queryFilterInChunks(contract, 'PerformanceBonusClaimed', START_BLOCK, currentBlock);
  console.log(`Found ${perfClaimedEvents.length} PerformanceBonusClaimed events.`);
  for (const event of perfClaimedEvents) {
    const args = event.args;
    const user = args.user.toLowerCase();
    const tierIdx = Number(args.tierIndex);
    const chooseInstant = args.chooseInstant;
    const tierDef = PERFORMANCE_TIERS[tierIdx] || { instant: 75, daily: 5 };
    const amount = chooseInstant ? tierDef.instant : 0;

    getEventsList(user).push({
      type: chooseInstant ? 'perf_instant' : 'perf_claim',
      typeName: chooseInstant ? 'Performance Bonus (Instant)' : 'Performance Bonus Claimed',
      fromUser: 'contract',
      amount,
      level: '-',
      timestamp: Number(args.processedTime !== undefined ? args.processedTime : args.time),
      status: 'Completed',
      txHash: event.transactionHash.toLowerCase(),
      blockNumber: event.blockNumber,
      isSimulated: false,
      tierIndex: tierIdx,
      logIndex: event.index,
      dailyRate: args.dailyRate ? Number(args.dailyRate) : undefined,
      streamStartTime: args.streamStartTime ? Number(args.streamStartTime) : undefined,
      streamEndTime: args.streamEndTime ? Number(args.streamEndTime) : undefined
    });
  }

  // 6. PerformanceDailyPaid
  const perfDailyEvents = await queryFilterInChunks(contract, 'PerformanceDailyPaid', START_BLOCK, currentBlock);
  console.log(`Found ${perfDailyEvents.length} PerformanceDailyPaid events.`);
  for (const event of perfDailyEvents) {
    const args = event.args;
    const user = args.user.toLowerCase();
    getEventsList(user).push({
      type: 'perf_daily',
      typeName: 'Performance Daily Salary',
      fromUser: 'contract',
      amount: parseFloat(ethers.formatUnits(args.amount, 18)),
      level: '-',
      timestamp: Number(args.time),
      status: 'Completed',
      txHash: event.transactionHash.toLowerCase(),
      blockNumber: event.blockNumber,
      isSimulated: false,
      logIndex: event.index
    });
  }

  // 7. ROIAccumulated
  const roiEvents = await queryFilterInChunks(contract, 'ROIAccumulated', START_BLOCK, currentBlock);
  console.log(`Found ${roiEvents.length} ROIAccumulated events.`);
  for (const event of roiEvents) {
    const args = event.args;
    const user = args.user.toLowerCase();
    getEventsList(user).push({
      type: 'roi',
      typeName: 'Daily ROI Payout',
      fromUser: 'contract',
      amount: parseFloat(ethers.formatUnits(args.amount, 18)),
      level: '-',
      timestamp: Number(args.time),
      status: 'Completed',
      txHash: event.transactionHash.toLowerCase(),
      blockNumber: event.blockNumber,
      isSimulated: false,
      logIndex: event.index
    });
  }

  // 8. BoosterROIAccumulated
  const boosterEvents = await queryFilterInChunks(contract, 'BoosterROIAccumulated', START_BLOCK, currentBlock);
  console.log(`Found ${boosterEvents.length} BoosterROIAccumulated events.`);
  for (const event of boosterEvents) {
    const args = event.args;
    const user = args.user.toLowerCase();
    getEventsList(user).push({
      type: 'booster_roi',
      typeName: 'Booster ROI Payout',
      fromUser: 'contract',
      amount: parseFloat(ethers.formatUnits(args.amount, 18)),
      level: '-',
      timestamp: Number(args.time),
      status: 'Completed',
      txHash: event.transactionHash.toLowerCase(),
      blockNumber: event.blockNumber,
      isSimulated: false,
      logIndex: event.index
    });
  }

  console.log('\n--- SYNCING DEPOSITS TO CONVEX ---');
  for (const [user, deposits] of Object.entries(depositsMap)) {
    if (deposits.length === 0) continue;
    console.log(`Syncing ${deposits.length} deposits for ${user}...`);
    const payload = JSON.stringify({ contractAddress: CONTRACT_ADDRESS, user, deposits });
    const escaped = payload.replace(/"/g, '\\"');
    execSync(`npx convex run transactions:syncDeposits "${escaped}"`, { cwd: 'd:/Projects_freelance_2026/June/DtInfinity/code/frontend' });
  }

  console.log('\n--- SYNCING WITHDRAWALS TO CONVEX ---');
  for (const [user, withdrawals] of Object.entries(withdrawalsMap)) {
    if (withdrawals.length === 0) continue;
    console.log(`Syncing ${withdrawals.length} withdrawals for ${user}...`);
    const payload = JSON.stringify({ contractAddress: CONTRACT_ADDRESS, user, withdrawals });
    const escaped = payload.replace(/"/g, '\\"');
    execSync(`npx convex run transactions:syncWithdrawals "${escaped}"`, { cwd: 'd:/Projects_freelance_2026/June/DtInfinity/code/frontend' });
  }

  console.log('\n--- SYNCING ON-CHAIN EVENTS TO CONVEX ---');
  for (const [user, events] of Object.entries(eventsMap)) {
    if (events.length === 0) continue;
    console.log(`Syncing ${events.length} events for ${user}...`);
    const payload = JSON.stringify({ contractAddress: CONTRACT_ADDRESS, user, events });
    const escaped = payload.replace(/"/g, '\\"');
    execSync(`npx convex run events:syncOnChainEvents "${escaped}"`, { cwd: 'd:/Projects_freelance_2026/June/DtInfinity/code/frontend' });
  }

  console.log('\n=== ALL ON-CHAIN EVENTS SUCCESSFULLY SYNCED WITH CONVEX DB ===');
}

main().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
