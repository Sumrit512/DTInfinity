const { ethers } = require('ethers');
const { execSync } = require('child_process');

const TARGET_USER = '0x9E2311Bc033d0997aF335EaC1990d5514ADE40E4';
const CONTRACT_ADDRESS = '0x386bf453c7cb46908f3635A939d3f3b918dabA4E';
const RPC_URL = 'https://bsc-testnet-rpc.publicnode.com';

const ABI = [
  'function getUserBasicInfo(address user) external view returns (address sponsor, uint256 totalDeposits, uint256 registrationTime, uint256 lastUpdateROI, uint256 claimableBalance, uint256 totalWithdrawn)',
  'function getUserIncomeInfo(address user) external view returns (uint256 dailyROIEarned, uint256 roiBoosterEarned, uint256 levelIncomeEarned, uint256 levelROIEarned, uint256 performanceBonusEarned)',
  'function getBoosterRate(address user) external view returns (uint256)',
  'function getUserDeposits(address userAddr) external view returns (tuple(uint256 amount, uint256 time, uint256 lastUpdateROI, uint256 dailyROIEarned, uint256 roiBoosterEarned, uint256 packageStartIncome, uint256 packageEndIncome, bool hasBooster, uint256 boosterRate, bool active)[])'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  console.log('Querying contract info...');
  const [basic, income, boosterRate, onChainDeposits] = await Promise.all([
    contract.getUserBasicInfo(TARGET_USER),
    contract.getUserIncomeInfo(TARGET_USER),
    contract.getBoosterRate(TARGET_USER),
    contract.getUserDeposits(TARGET_USER)
  ]);

  console.log('Querying Convex DB...');
  const payload = JSON.stringify({ contractAddress: CONTRACT_ADDRESS, address: TARGET_USER });
  const escaped = payload.replace(/"/g, '\\"');
  const dbLedgerOut = execSync(`npx convex run events:getLedger "${escaped}"`, { cwd: 'd:/Projects_freelance_2026/June/DtInfinity/code/frontend' });
  const dbLedger = JSON.parse(dbLedgerOut.toString());

  console.log('Running simulation...');
  const { generateEventsList } = require('./src/utils/simulation.js');
  const realDeposits = dbLedger.filter(e => e.type === 'deposit');

  const result = generateEventsList(
    TARGET_USER,
    Number(basic.registrationTime),
    basic.totalDeposits.toString(),
    income.dailyROIEarned.toString(),
    income.roiBoosterEarned.toString(),
    income.levelIncomeEarned.toString(),
    income.levelROIEarned.toString(),
    income.performanceBonusEarned.toString(),
    parseFloat(ethers.formatUnits(boosterRate, 2)) / 100,
    60,
    60,
    null,
    [],
    realDeposits,
    dbLedger
  );

  console.log('Simulation complete! Printing results...');
  console.log('Simulated Daily ROI:', result.totals.dailyROI, 'USDT');
  console.log('Simulated Booster ROI:', result.totals.boosterROI, 'USDT');
}

main().catch(err => console.error(err));
