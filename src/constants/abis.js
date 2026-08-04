// Default contract addresses (placeholders that user can update in settings)
export const DEFAULT_DT_INFINITY_ADDRESS = "0x704757e295217895a3e7a15a88773489b20dee82";
export const DEFAULT_USDT_ADDRESS = "0x5e2893770f10106BAD262939d9275463Ce333f46";

// Simple USDT ABI
export const USDT_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function decimals() external view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// DTInfinity ABI
export const DT_INFINITY_ABI = [
  "function usdtToken() external view returns (address)",
  "function ONE_DAY() external view returns (uint256)",
  "function PERF_ONE_DAY() external view returns (uint256)",
  "function totalUsers() external view returns (uint256)",
  "function totalDeposited() external view returns (uint256)",
  "function totalWithdrawn() external view returns (uint256)",
  "function isUserRegistered(address user) external view returns (bool)",
  "function getDirectReferrals(address user) external view returns (address[])",
  "function getBoosterRate(address userAddr) external view returns (uint256)",
  "function deposit(uint256 amount, address sponsorAddress) external",
  "function withdraw(uint256 amount) external",
  "function claimAll() external",
  "function getUserBasicInfo(address user) external view returns (address sponsor, uint256 totalDeposits, uint256 registrationTime, uint256 lastUpdateROI, uint256 claimableBalance, uint256 totalWithdrawn)",
  "function getUserIncomeInfo(address user) external view returns (uint256 dailyROIEarned, uint256 roiBoosterEarned, uint256 levelIncomeEarned, uint256 levelROIEarned, uint256 performanceBonusEarned)",
  "function getUserNetworkInfo(address user) external view returns (uint256 directCount, uint256 qualifiedDirectsCount, uint256 totalTeamCount, uint256 totalTeamVolume, address strongestLegAddress, uint256 strongestLegVolume)",
  "function getPendingBalances(address userAddr) external view returns (uint256 pendingDaily, uint256 pendingBooster, uint256 pendingPerf)",
  "function getUserDeposits(address userAddr) external view returns (tuple(uint256 amount, uint256 time, uint256 lastUpdateROI, uint256 dailyROIEarned, uint256 roiBoosterEarned, uint256 rateBps, bool isFirstDeposit)[])",
  "function getUserWithdrawals(address userAddr) external view returns (tuple(uint256 amount, uint256 time)[])",
  "function userLegVolume(address sponsor, address directReferral) external view returns (uint256)",
  "function claimPerformanceBonus(uint256 tierIndex, bool chooseInstant) external",
  "function pendingTiers(address user, uint256 index) external view returns (bool)",
  "function pendingTierCappedAtStart(address user, uint256 index) external view returns (bool)",
  "function qualificationMonth(address user, uint256 index) external view returns (uint256)",
  "function getActiveBonuses(address user) external view returns (tuple(uint256 startTime, uint256 lastClaimTime, uint256 dailyRate, uint256 endTime)[])",
  "function getPerformanceBonusRecords(address user) external view returns (tuple(uint16 recordVersion, uint256 recordId, uint256 tierIndex, uint256 monthId, uint256 qualificationTimestamp, uint256 claimWindowOpenTimestamp, uint256 streamStartTimestamp, uint256 streamEndTimestamp, uint256 activatedTimestamp, uint256 intervalSeconds, uint256 scheduledIntervals, uint256 dailyRate, uint256 instantAmount, uint256 dailyAmount, uint256 totalBonus, uint256 daysPaid, uint256 amountPaid, uint8 status, uint8 activationType, bool completed)[])",
  "function getPendingPerformanceQualifications(address userAddr) external view returns (tuple(uint256 tierIndex, uint256 target, uint256 instant, uint256 daily, bool isPending, uint256 claimTime, bool isClaimWindowActive)[])",
  "function getDashboardStats(address user) external view returns (tuple(uint256 dailyROIEarned, uint256 boosterROIEarned, uint256 totalROIEarned, uint256 levelIncomeEarned, uint256 levelROIEarned, uint256 performanceBonusEarned, uint256 pendingDailyROI, uint256 pendingBoosterROI, uint256 pendingPerformanceBonus, uint256 dashboardROI, uint256 dashboardPerformanceBonus, uint256 claimableBalance, uint256 dashboardClaimableBalance, uint256 totalEarned, uint256 roiCap, uint256 roiUsed, uint256 roiRemaining, uint256 roiPercentUsed, uint256 networkCap, uint256 networkUsed, uint256 networkRemaining, uint256 networkPercentUsed))",
  "event Registered(address indexed user, address indexed sponsor, uint256 time)",
  "event Deposited(address indexed user, uint256 amount, uint256 time)",
  "event Withdrawn(address indexed user, uint256 amount, uint256 time)",
  "event LevelIncomePaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)",
  "event LevelROIPaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)",
  "event PerformanceBonusAchieved(address indexed user, uint256 tierIndex, uint256 instantReward, uint256 time)",
  "event PerformanceBonusClaimed(address indexed user, uint256 tierIndex, bool chooseInstant, uint256 processedTime, uint256 streamStartTime, uint256 streamEndTime, uint256 dailyRate)",
  "event ROIAccumulated(address indexed user, uint256 amount, uint256 time)",
  "event BoosterROIAccumulated(address indexed user, uint256 amount, uint256 time)",
  "event PerformanceDailyPaid(address indexed user, uint256 amount, uint256 time)"
];

export const PERFORMANCE_TIERS = [
  { target: 1500, instant: 75, daily: 5 },
  { target: 3500, instant: 150, daily: 10 },
  { target: 7500, instant: 375, daily: 25 },
  { target: 12500, instant: 750, daily: 50 },
  { target: 25000, instant: 2250, daily: 150 },
  { target: 75000, instant: 7500, daily: 500 }
];
