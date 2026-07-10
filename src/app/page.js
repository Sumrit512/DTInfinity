"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ethers } from "ethers";

// Default contract addresses (placeholders that user can update in settings)
const DEFAULT_DT_INFINITY_ADDRESS = "0xcC86D7ee69e984820F2De666a36B8025BE23E459";
const DEFAULT_USDT_ADDRESS = "0x0aB8c2DfE9aD2e2D3f58E6006884cda5e6f1E7B9";

// Simple USDT ABI
const USDT_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function decimals() external view returns (uint8)"
];

// DTInfinity ABI
const DT_INFINITY_ABI = [
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
  "function getUserDeposits(address userAddr) external view returns (tuple(uint256 amount, uint256 time)[])",
  "function getUserWithdrawals(address userAddr) external view returns (tuple(uint256 amount, uint256 time)[])",
  "function userLegVolume(address sponsor, address directReferral) external view returns (uint256)",
  "function claimPerformanceBonus(uint256 tierIndex, bool chooseInstant) external",
  "function pendingTiers(address user, uint256 index) external view returns (bool)",
  "function qualificationMonth(address user, uint256 index) external view returns (uint256)",
  "function getPendingPerformanceQualifications(address userAddr) external view returns (tuple(uint256 tierIndex, uint256 target, uint256 instant, uint256 daily, bool isPending, uint256 claimTime, bool isClaimWindowActive)[])",
  "function getActiveBonuses(address user) external view returns (tuple(uint256 startTime, uint256 lastClaimTime, uint256 dailyRate, uint256 endTime)[])",
  "event Registered(address indexed user, address indexed sponsor, uint256 time)",
  "event Deposited(address indexed user, uint256 amount, uint256 time)",
  "event Withdrawn(address indexed user, uint256 amount, uint256 time)",
  "event LevelIncomePaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)",
  "event LevelROIPaid(address indexed upline, address indexed downline, uint256 level, uint256 amount, uint256 time)",
  "event PerformanceBonusAchieved(address indexed user, uint256 tierIndex, uint256 instantReward, uint256 time)",
  "event PerformanceBonusClaimed(address indexed user, uint256 tierIndex, bool chooseInstant, uint256 time)",
  "event ROIAccumulated(address indexed user, uint256 amount, uint256 time)",
  "event BoosterROIAccumulated(address indexed user, uint256 amount, uint256 time)",
  "event PerformanceDailyPaid(address indexed user, uint256 amount, uint256 time)"
];

const PERFORMANCE_TIERS = [
  { target: 1500, instant: 75, daily: 5 },
  { target: 3500, instant: 150, daily: 10 },
  { target: 7500, instant: 375, daily: 25 },
  { target: 12500, instant: 750, daily: 50 },
  { target: 25000, instant: 2250, daily: 150 },
  { target: 50000, instant: 7500, daily: 500 }
];

export default function Dashboard() {
  const [activeView, setActiveView] = useState("dashboard");
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [networkName, setNetworkName] = useState("BEP-20 · BSC Testnet");
  const [loading, setLoading] = useState(false);
  const [onChainEvents, setOnChainEvents] = useState([]);
  const [copyText, setCopyText] = useState("Copy");
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);
  const [targetChainId, setTargetChainId] = useState(97n);

  const [treeRoot, setTreeRoot] = useState("");
  const [treeNodes, setTreeNodes] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("DT_INFINITY_TREE_NODES");
        return stored ? JSON.parse(stored) : {};
      } catch (e) {
        console.warn("Failed to read treeNodes from localStorage", e);
      }
    }
    return {};
  });

  const updateTreeNodes = (newNodes) => {
    setTreeNodes(prev => {
      const updated = typeof newNodes === "function" ? newNodes(prev) : { ...prev, ...newNodes };
      try {
        localStorage.setItem("DT_INFINITY_TREE_NODES", JSON.stringify(updated));
      } catch (e) {
        console.warn("Failed to save treeNodes to localStorage", e);
      }
      return updated;
    });
  };

  const [selectedNode, setSelectedNode] = useState("");

  // Contract Addresses (Configurable by user)
  const [dtInfinityAddress, setDtInfinityAddress] = useState(DEFAULT_DT_INFINITY_ADDRESS);
  const [usdtAddress, setUsdtAddress] = useState(DEFAULT_USDT_ADDRESS);
  const [deploymentBlock, setDeploymentBlock] = useState("0");

  // Form states
  const [depositAmount, setDepositAmount] = useState("10");
  const [sponsorAddress, setSponsorAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddressInput, setWithdrawAddressInput] = useState("");

  // Live Smart Contract Data
  const [contractUSDTBalance, setContractUSDTBalance] = useState("0.00");
  const [walletUSDTBalance, setWalletUSDTBalance] = useState("0.00");
  const [lastDepositAmount, setLastDepositAmount] = useState("0.00");
  const [isRegistered, setIsRegistered] = useState(false);
  const [userData, setUserData] = useState({
    sponsor: ethers.ZeroAddress,
    totalDeposits: "0.00",
    registrationTime: 0,
    lastUpdateROI: 0,
    dailyROIEarned: "0.00",
    roiBoosterEarned: "0.00",
    levelIncomeEarned: "0.00",
    levelROIEarned: "0.00",
    performanceBonusEarned: "0.00",
    claimableBalance: "0.00",
    totalWithdrawn: "0.00",
    directCount: 0,
    qualifiedDirectsCount: 0,
    totalTeamCount: 0,
    totalTeamVolume: "0.00",
    strongestLegAddress: ethers.ZeroAddress,
    strongestLegVolume: "0.00",
    boosterRate: "0.00"
  });

  const [pendingBalances, setPendingBalances] = useState({
    pendingDaily: "0.00",
    pendingBooster: "0.00",
    pendingPerf: "0.00"
  });

  const [directsList, setDirectsList] = useState([]);
  const [pendingQualifications, setPendingQualifications] = useState([]);
  const [activeBonuses, setActiveBonuses] = useState([]);
  const [origin, setOrigin] = useState("");

  // Advanced Transaction Filters
  const [filterType, setFilterType] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [searchFromUser, setSearchFromUser] = useState("");
  const [searchLevel, setSearchLevel] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Real-time ticking simulation states
  const [oneDay, setOneDay] = useState(86400n);
  const [perfOneDay, setPerfOneDay] = useState(86400n);
  const [secondsSinceSync, setSecondsSinceSync] = useState(0);

  // Mobile responsiveness sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!walletConnected || !isRegistered) {
      setSecondsSinceSync(0);
      return;
    }

    const interval = setInterval(() => {
      setSecondsSinceSync(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [walletConnected, isRegistered, userData.lastUpdateROI]);

  // Load saved contract configuration
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      let savedDT = localStorage.getItem("DT_INFINITY_ADDRESS");
      if (savedDT && (
        savedDT.toLowerCase() === "0xa374e919738dc198213a497937f396d275e348f7" || 
        savedDT.toLowerCase() === "0x4ee2e6e9306bd8f5b6e111062aae9c259f7b4df3" ||
        savedDT.toLowerCase() === "0xa2306ed14dc4e1f0c876260621e7dba5a7797eff" ||
        savedDT.toLowerCase() === "0x32116f10442966206c64279105c6d783743fb186"
      )) {
        localStorage.removeItem("DT_INFINITY_ADDRESS");
        savedDT = null;
      }
      const savedUSDT = localStorage.getItem("USDT_ADDRESS");
      const savedChain = localStorage.getItem("TARGET_CHAIN_ID");
      const savedBlock = localStorage.getItem("DT_INFINITY_DEPLOYMENT_BLOCK");
      if (savedDT) setDtInfinityAddress(savedDT);
      if (savedUSDT) setUsdtAddress(savedUSDT);
      if (savedChain) setTargetChainId(BigInt(savedChain));
      if (savedBlock) setDeploymentBlock(savedBlock);

      // Parse referral code from URL query parameters
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && ethers.isAddress(ref)) {
        setSponsorAddress(ref);
        // Switch to deposit tab if a referral link is active to help registration
        setActiveView("deposit");
      }
    }
  }, []);

  // Reset pagination page when search filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterLevel, filterStartDate, filterEndDate, searchFromUser, searchLevel]);

  // Save contract configuration
  const handleSaveConfig = () => {
    localStorage.setItem("DT_INFINITY_ADDRESS", dtInfinityAddress);
    localStorage.setItem("USDT_ADDRESS", usdtAddress);
    localStorage.setItem("TARGET_CHAIN_ID", targetChainId.toString());
    localStorage.setItem("DT_INFINITY_DEPLOYMENT_BLOCK", deploymentBlock);
    alert("Smart contract configuration updated successfully!");
    if (walletConnected) {
      loadBlockchainData(walletAddress);
    }
  };

  // Clear transaction cache to force rebuild
  const handleResetCache = () => {
    if (walletAddress) {
      const cacheKey = `TX_CACHE_${walletAddress.toLowerCase()}`;
      localStorage.removeItem(cacheKey);
      alert("Transaction history cache cleared! Rebuilding from block...");
      loadBlockchainData(walletAddress);
    } else {
      alert("Please connect wallet first.");
    }
  };

  // Helper formatting functions
  function shorten(addr) {
    if (!addr || addr === ethers.ZeroAddress) return "None";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function formatUSDT(bigIntVal) {
    if (!bigIntVal) return "0.00";
    return parseFloat(ethers.formatUnits(bigIntVal, 18)).toFixed(2);
  }

  // Connect to MetaMask or Trust Wallet
  async function connectWallet() {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        setLoading(true);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts && accounts[0]) {
          const addr = accounts[0];
          setWalletAddress(addr);
          setWalletConnected(true);
          setWithdrawAddressInput(addr); // Autofill withdrawal address input
          
          const network = await provider.getNetwork();
          const chainId = network.chainId;
          if (chainId === 97n) {
            setNetworkName("BEP-20 · BSC Testnet");
          } else if (chainId === 56n) {
            setNetworkName("BEP-20 · BSC Mainnet");
          } else {
            setNetworkName(`BEP-20 · Chain ID: ${chainId.toString()}`);
          }

          if (chainId !== targetChainId) {
            setIsWrongNetwork(true);
          } else {
            setIsWrongNetwork(false);
            await loadBlockchainData(addr);
          }
        }
      } catch (err) {
        console.error("Wallet connection failed", err);
      } finally {
        setLoading(false);
      }
    } else {
      alert("No crypto wallet detected. Please install MetaMask or Trust Wallet.");
    }
  }

  // Switch network automatically or add target network
  async function switchNetwork() {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        setLoading(true);
        const hexChainId = "0x" + targetChainId.toString(16);
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }]
        });
        setIsWrongNetwork(false);
        if (walletAddress) {
          await loadBlockchainData(walletAddress);
        }
      } catch (switchError) {
        if (switchError.code === 4902) {
          try {
            if (targetChainId === 97n) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0x61",
                    chainName: "BNB Smart Chain Testnet",
                    nativeCurrency: {
                      name: "tBNB",
                      symbol: "tBNB",
                      decimals: 18
                    },
                    rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
                    blockExplorerUrls: ["https://testnet.bscscan.com"]
                  }
                ]
              });
            } else if (targetChainId === 56n) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0x38",
                    chainName: "BNB Smart Chain Mainnet",
                    nativeCurrency: {
                      name: "BNB",
                      symbol: "BNB",
                      decimals: 18
                    },
                    rpcUrls: ["https://bsc-dataseed.binance.org/"],
                    blockExplorerUrls: ["https://bscscan.com"]
                  }
                ]
              });
            }
            setIsWrongNetwork(false);
            if (walletAddress) {
              await loadBlockchainData(walletAddress);
            }
          } catch (addError) {
            console.error("Failed to add network", addError);
            alert("Failed to add target network to wallet.");
          }
        } else {
          console.error("Failed to switch network", switchError);
          alert("Failed to switch network.");
        }
      } finally {
        setLoading(false);
      }
    }
  }

  // Load a single node in the network tree
  async function loadTreeNode(addr, dtContractInstance = null) {
    if (!addr || addr === ethers.ZeroAddress) return;
    try {
      let contract = dtContractInstance;
      if (!contract) {
        if (!window.ethereum) return;
        const provider = new ethers.BrowserProvider(window.ethereum);
        contract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, provider);
      }
      
      const registered = await contract.isUserRegistered(addr);
      if (!registered) return;
      
      const [basicInfo, networkInfo, directs, boosterRate, incomeInfo] = await Promise.all([
        contract.getUserBasicInfo(addr),
        contract.getUserNetworkInfo(addr),
        contract.getDirectReferrals(addr),
        contract.getBoosterRate(addr),
        contract.getUserIncomeInfo(addr)
      ]);
      
      const nodeData = {
        address: addr,
        sponsor: basicInfo.sponsor,
        totalDeposits: formatUSDT(basicInfo.totalDeposits),
        registrationTime: Number(basicInfo.registrationTime),
        lastUpdateROI: Number(basicInfo.lastUpdateROI),
        directCount: Number(networkInfo.directCount),
        qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount),
        totalTeamCount: Number(networkInfo.totalTeamCount),
        totalTeamVolume: formatUSDT(networkInfo.totalTeamVolume),
        strongestLegAddress: networkInfo.strongestLegAddress,
        strongestLegVolume: formatUSDT(networkInfo.strongestLegVolume),
        children: directs,
        boosterRate: Number(boosterRate) / 100,
        dailyROIEarned: formatUSDT(incomeInfo.dailyROIEarned),
        roiBoosterEarned: formatUSDT(incomeInfo.roiBoosterEarned),
        levelIncomeEarned: formatUSDT(incomeInfo.levelIncomeEarned),
        levelROIEarned: formatUSDT(incomeInfo.levelROIEarned),
        performanceBonusEarned: formatUSDT(incomeInfo.performanceBonusEarned)
      };
      
      updateTreeNodes(prev => ({
        ...prev,
        [addr.toLowerCase()]: nodeData
      }));
      return nodeData;
    } catch (e) {
      console.error("Failed to load tree node", addr, e);
      return null;
    }
  }

  // Reload data from blockchain
  async function loadBlockchainData(addr) {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      const network = await provider.getNetwork();
      const chainId = network.chainId;
      if (chainId !== targetChainId) {
        setIsWrongNetwork(true);
        return;
      }
      setIsWrongNetwork(false);

      // 1. Load Contract Available Balance
      const usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, provider);
      let contractBal = 0n;
      let walletBal = 0n;
      try {
        contractBal = await usdtContract.balanceOf(dtInfinityAddress);
        walletBal = await usdtContract.balanceOf(addr);
      } catch (e) {
        console.warn("Could not read USDT balances. Check USDT Contract Address.", e);
      }
      setContractUSDTBalance(formatUSDT(contractBal));
      setWalletUSDTBalance(formatUSDT(walletBal));

      // 2. Check registration and load user data
      const dtContract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, provider);
      let currentOneDayVal = 86400n;
      let currentPerfOneDayVal = 86400n;
      try {
        currentOneDayVal = await dtContract.ONE_DAY();
        setOneDay(currentOneDayVal);
      } catch (e) {
        console.warn("Could not read ONE_DAY", e);
      }
      try {
        currentPerfOneDayVal = await dtContract.PERF_ONE_DAY();
        setPerfOneDay(currentPerfOneDayVal);
      } catch (e) {
        console.warn("Could not read PERF_ONE_DAY", e);
        currentPerfOneDayVal = currentOneDayVal;
      }
      
      let registered = false;
      try {
        registered = await dtContract.isUserRegistered(addr);
      } catch (e) {
        console.warn("Could not check registration. Check DTInfinity Contract Address.", e);
      }
      setIsRegistered(registered);

      if (registered) {
        // Load user data using subset view helpers to avoid stack too deep
        const [basicInfo, incomeInfo, networkInfo] = await Promise.all([
          dtContract.getUserBasicInfo(addr),
          dtContract.getUserIncomeInfo(addr),
          dtContract.getUserNetworkInfo(addr)
        ]);
        const boosterRate = await dtContract.getBoosterRate(addr);
        const pending = await dtContract.getPendingBalances(addr);
        const directs = await dtContract.getDirectReferrals(addr);

        setUserData({
          sponsor: basicInfo.sponsor,
          totalDeposits: formatUSDT(basicInfo.totalDeposits),
          registrationTime: Number(basicInfo.registrationTime),
          lastUpdateROI: Number(basicInfo.lastUpdateROI),
          dailyROIEarned: formatUSDT(incomeInfo.dailyROIEarned),
          roiBoosterEarned: formatUSDT(incomeInfo.roiBoosterEarned),
          levelIncomeEarned: formatUSDT(incomeInfo.levelIncomeEarned),
          levelROIEarned: formatUSDT(incomeInfo.levelROIEarned),
          performanceBonusEarned: formatUSDT(incomeInfo.performanceBonusEarned),
          claimableBalance: formatUSDT(basicInfo.claimableBalance),
          totalWithdrawn: formatUSDT(basicInfo.totalWithdrawn),
          directCount: Number(networkInfo.directCount),
          qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount),
          totalTeamCount: Number(networkInfo.totalTeamCount),
          totalTeamVolume: formatUSDT(networkInfo.totalTeamVolume),
          strongestLegAddress: networkInfo.strongestLegAddress,
          strongestLegVolume: formatUSDT(networkInfo.strongestLegVolume),
          boosterRate: (Number(boosterRate) / 100).toFixed(1) + "%"
        });

        setTreeRoot(addr);
        updateTreeNodes(prev => ({
          ...prev,
          [addr.toLowerCase()]: {
            address: addr,
            sponsor: basicInfo.sponsor,
            totalDeposits: formatUSDT(basicInfo.totalDeposits),
            registrationTime: Number(basicInfo.registrationTime),
            lastUpdateROI: Number(basicInfo.lastUpdateROI),
            directCount: Number(networkInfo.directCount),
            qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount),
            totalTeamCount: Number(networkInfo.totalTeamCount),
            totalTeamVolume: formatUSDT(networkInfo.totalTeamVolume),
            strongestLegAddress: networkInfo.strongestLegAddress,
            strongestLegVolume: formatUSDT(networkInfo.strongestLegVolume),
            children: directs,
            boosterRate: Number(boosterRate) / 100,
            dailyROIEarned: formatUSDT(incomeInfo.dailyROIEarned),
            roiBoosterEarned: formatUSDT(incomeInfo.roiBoosterEarned),
            levelIncomeEarned: formatUSDT(incomeInfo.levelIncomeEarned),
            levelROIEarned: formatUSDT(incomeInfo.levelROIEarned),
            performanceBonusEarned: formatUSDT(incomeInfo.performanceBonusEarned)
          }
        }));
        if (!selectedNode) {
          setSelectedNode(addr);
        }

        setPendingBalances({
          pendingDaily: formatUSDT(pending.pendingDaily),
          pendingBooster: formatUSDT(pending.pendingBooster),
          pendingPerf: formatUSDT(pending.pendingPerf)
        });

        setSecondsSinceSync(0); // Reset timer on successful blockchain load

        setDirectsList(directs);

        let loadedDirectsMap = {};
        // Auto-load all downline referrals recursively up to 5 levels for complete Level Income simulation
        if (directs && directs.length > 0) {
          try {
            let totalLoadedNodes = 0;
            const loadTreeRecursively = async (addresses, currentLevel) => {
              if (currentLevel >= 5 || !addresses || addresses.length === 0 || totalLoadedNodes >= 100) return;
              const chunk = addresses.slice(0, 100 - totalLoadedNodes);
              totalLoadedNodes += chunk.length;
              
              const results = await Promise.all(chunk.map(childAddr => loadTreeNode(childAddr, dtContract)));
              const nextLevelAddresses = [];
              results.forEach(res => {
                if (res) {
                  loadedDirectsMap[res.address.toLowerCase()] = res;
                  if (res.children && res.children.length > 0) {
                    nextLevelAddresses.push(...res.children);
                  }
                }
              });
              await loadTreeRecursively(nextLevelAddresses, currentLevel + 1);
            };
            loadTreeRecursively(directs, 1);
          } catch (e) {
            console.warn("Failed to recursively auto-load downline referrals", e);
          }
        }

        // Load pending performance qualifications
        try {
          const pendingQuals = await dtContract.getPendingPerformanceQualifications(addr);
          const qualsMapped = pendingQuals.map(q => ({
            tierIndex: Number(q.tierIndex),
            target: parseFloat(ethers.formatUnits(q.target, 18)),
            instant: parseFloat(ethers.formatUnits(q.instant, 18)),
            daily: parseFloat(ethers.formatUnits(q.daily, 18)),
            isPending: q.isPending,
            claimTime: Number(q.claimTime),
            isClaimWindowActive: q.isClaimWindowActive
          }));
          setPendingQualifications(qualsMapped);
        } catch (e) {
          console.warn("Could not read pending performance qualifications", e);
        }

        // Load active performance bonuses
        try {
          const bonuses = await dtContract.getActiveBonuses(addr);
          let bonusesMapped = bonuses.map(b => {
            const dailyRateVal = parseFloat(ethers.formatUnits(b.dailyRate || 0n, 18));
            let tierIndex = 0;
            for (let t = 0; t < PERFORMANCE_TIERS.length; t++) {
              if (Math.abs(PERFORMANCE_TIERS[t].daily - dailyRateVal) < 0.1) {
                tierIndex = t;
                break;
              }
            }
            return {
              tierIndex,
              dailyRate: dailyRateVal,
              startTime: Number(b.startTime || 0n),
              endTime: Number(b.endTime || 0n),
              lastClaimTime: Number(b.lastClaimTime || 0n)
            };
          });

          // Check if there are any pending tiers that have expired (auto-claimable)
          // and push them into the simulated active bonuses array.
          const PERF_ONE_DAY_SECS = Number(currentPerfOneDayVal || 86400n);
          for (let t = 0; t < 6; t++) {
            try {
              const isPending = await dtContract.pendingTiers(addr, t);
              if (isPending) {
                const claimTime = Number(await dtContract.qualificationMonth(addr, t));
                const now = Math.floor(Date.now() / 1000);
                if (now >= claimTime + PERF_ONE_DAY_SECS) {
                  // This tier has expired and is auto-claimable as Daily stream!
                  const dailyRateVal = PERFORMANCE_TIERS[t].daily;
                  const startTimeVal = claimTime;
                  const endTimeVal = claimTime + 30 * PERF_ONE_DAY_SECS;
                  
                  if (!bonusesMapped.some(b => b.tierIndex === t)) {
                    bonusesMapped.push({
                      tierIndex: t,
                      dailyRate: dailyRateVal,
                      startTime: startTimeVal,
                      endTime: endTimeVal,
                      lastClaimTime: startTimeVal
                    });
                  }
                }
              }
            } catch (err) {
              console.warn(`Could not check pendingTiers mapping for tier ${t}`, err);
            }
          }

          setActiveBonuses(bonusesMapped);
        } catch (e) {
          console.warn("Could not read active bonuses", e);
        }

        // Load on-chain deposits and withdrawals directly from contract
        let deposits = [];
        let withdrawals = [];
        try {
          const userDeposits = await dtContract.getUserDeposits(addr);
          if (userDeposits && userDeposits.length > 0) {
            setLastDepositAmount(formatUSDT(userDeposits[userDeposits.length - 1].amount));
          } else {
            setLastDepositAmount(formatUSDT(basicInfo.totalDeposits));
          }
          deposits = userDeposits.map((d, i) => ({
            type: "deposit",
            typeName: "Deposit",
            fromUser: "Self",
            amount: parseFloat(ethers.formatUnits(d.amount || 0n, 18)),
            level: "-",
            timestamp: Number(d.time || 0n),
            status: "Completed",
            txHash: `0x_dep_${addr}_${i}`,
            blockNumber: 0
          }));

          const userWithdrawals = await dtContract.getUserWithdrawals(addr);
          withdrawals = userWithdrawals.map((w, i) => ({
            type: "withdraw",
            typeName: "Withdrawal",
            fromUser: "Self",
            amount: parseFloat(ethers.formatUnits(w.amount || 0n, 18)),
            level: "-",
            timestamp: Number(w.time || 0n),
            status: "Completed",
            txHash: `0x_with_${addr}_${i}`,
            blockNumber: 0
          }));
        } catch (e) {
          console.warn("Could not read user deposits/withdrawals arrays", e);
        }

        // Fetch PerformanceBonusClaimed events using robust public RPC endpoints loop
        let perfClaims = [];
        const rpcUrls = [
          "https://bsc-testnet.publicnode.com",
          "https://data-seed-prebsc-1-s1.binance.org:8545",
          "https://data-seed-prebsc-2-s1.binance.org:8545"
        ];
        
        for (const url of rpcUrls) {
          try {
            const publicProvider = new ethers.JsonRpcProvider(url);
            const latestBlock = Number(await publicProvider.getBlockNumber());
            let fromBlockVal = deploymentBlock ? (isNaN(Number(deploymentBlock)) ? 0 : Number(deploymentBlock)) : 0;
            if (fromBlockVal === 0 || (latestBlock - fromBlockVal) > 49000) {
              fromBlockVal = Math.max(0, latestBlock - 49000);
            }
            const dtContractPublic = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, publicProvider);
            const filter = await dtContractPublic.filters.PerformanceBonusClaimed(addr);
            const events = await dtContractPublic.queryFilter(filter, fromBlockVal);
            
            if (events) {
              perfClaims = events.map((event, idx) => {
                const args = event.args;
                const tierIdx = Number(args.tierIndex);
                const chooseInstant = args.chooseInstant;
                const time = Number(args.time);
                const tier = PERFORMANCE_TIERS[tierIdx];
                
                return {
                  type: chooseInstant ? "perf_instant" : "perf_claim",
                  typeName: chooseInstant ? "Performance Bonus (Instant)" : "Performance Bonus Claimed",
                  fromUser: "Contract",
                  amount: chooseInstant ? tier.instant : 0,
                  level: "-",
                  timestamp: time,
                  status: "Completed",
                  txHash: event.transactionHash || `0x_perf_claim_${addr}_${idx}`,
                  blockNumber: Number(event.blockNumber || 0)
                };
              });
              break; // successfully queried events, break loop
            }
          } catch (err) {
            console.warn(`Query logs failed on RPC ${url}, trying next...`);
          }
        }

        setOnChainEvents([...deposits, ...withdrawals, ...perfClaims]);
      } else {
        // Reset user data for unregistered
        setUserData({
          sponsor: ethers.ZeroAddress,
          totalDeposits: "0.00",
          registrationTime: 0,
          lastUpdateROI: 0,
          dailyROIEarned: "0.00",
          roiBoosterEarned: "0.00",
          levelIncomeEarned: "0.00",
          levelROIEarned: "0.00",
          performanceBonusEarned: "0.00",
          claimableBalance: "0.00",
          totalWithdrawn: "0.00",
          directCount: 0,
          qualifiedDirectsCount: 0,
          totalTeamCount: 0,
          totalTeamVolume: "0.00",
          strongestLegAddress: ethers.ZeroAddress,
          strongestLegVolume: "0.00",
          boosterRate: "0.0%"
        });
        setPendingBalances({
          pendingDaily: "0.00",
          pendingBooster: "0.00",
          pendingPerf: "0.00"
        });
        setDirectsList([]);
        setOnChainEvents([]);
        setPendingQualifications([]);
        setActiveBonuses([]);
        setLastDepositAmount("0.00");
      }
    } catch (err) {
      console.error("Error loading blockchain data", err);
    }
  }

  // Locally simulate transaction ledger for ROI and Matching
  function generateSimulatedLedger(addr, basicInfo, incomeInfo, directs, currentOneDayVal, loadedDirectsMap = {}, userDeposits = [], currentPerfOneDayVal = 86400n) {
    const sponsorJoin = Number(basicInfo?.registrationTime || 0);
    const sponsorDeposit = basicInfo ? parseFloat(ethers.formatUnits(basicInfo.totalDeposits, 18)) : 0;
    const ONE_DAY_SECS = Number(currentOneDayVal || 86400n);
    const PERF_ONE_DAY_SECS = Number(currentPerfOneDayVal || 86400n);
    const now = Math.floor(Date.now() / 1000);
    const numDays = Math.floor((now - sponsorJoin) / ONE_DAY_SECS);

    // Calculate initial deposit and setup chronological deposit tracking
    const sortedDeps = [...userDeposits].sort((a, b) => a.timestamp - b.timestamp);
    const upgradeDepositsSum = sortedDeps
      .filter(d => d.timestamp > sponsorJoin)
      .reduce((sum, d) => sum + d.amount, 0);
    const initialDep = Math.max(0, sponsorDeposit - upgradeDepositsSum);

    function getActiveDepositAtTime(timestamp) {
      let activeDep = initialDep;
      sortedDeps.forEach(dep => {
        if (dep.timestamp <= timestamp && dep.timestamp > sponsorJoin) {
          activeDep += dep.amount;
        }
      });
      return activeDep;
    }

    console.log("Simulating ledger debug:", {
      basicInfoExists: !!basicInfo,
      sponsorJoin,
      sponsorDeposit,
      ONE_DAY_SECS,
      now,
      diff: now - sponsorJoin,
      numDays
    });

    if (!basicInfo || Number(basicInfo.registrationTime) === 0 || basicInfo.totalDeposits === 0n) {
      console.log("Simulating ledger exit: conditions not met");
      return [];
    }

    // Load directs data first to check qualifications
    const directsData = [];
    const directsToUse = directs || directsList;
    directsToUse.forEach(childAddr => {
      const node = loadedDirectsMap[childAddr.toLowerCase()] || treeNodes[childAddr.toLowerCase()];
      if (node) {
        directsData.push({
          address: childAddr,
          registrationTime: node.registrationTime,
          totalDeposits: parseFloat(node.totalDeposits),
          cumulativeTotalEarned: parseFloat(node.dailyROIEarned || 0)
            + parseFloat(node.roiBoosterEarned || 0)
            + parseFloat(node.levelIncomeEarned || 0)
            + parseFloat(node.levelROIEarned || 0)
            + parseFloat(node.performanceBonusEarned || 0)
        });
      }
    });

    const list = [];

    // Traverse the downline tree up to 5 levels to simulate individual Level Incomes
    const levelIncomePercentages = [500, 200, 100, 100, 100];
    const queue = [{ address: addr, level: 0 }];
    const visited = new Set([addr.toLowerCase()]);
    
    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      if (curr.level >= 5) continue;
      
      const currNode = curr.address.toLowerCase() === addr.toLowerCase()
        ? { children: directs || directsList }
        : (loadedDirectsMap[curr.address.toLowerCase()] || treeNodes[curr.address.toLowerCase()]);
        
      if (currNode && currNode.children) {
        currNode.children.forEach(childAddr => {
          const childKey = childAddr.toLowerCase();
          if (!visited.has(childKey)) {
            visited.add(childKey);
            const childNode = loadedDirectsMap[childKey] || treeNodes[childKey];
            if (childNode) {
              const depositVal = parseFloat(childNode.totalDeposits || 0);
              const currentSponsorDeposit = getActiveDepositAtTime(childNode.registrationTime);
              const qualifiedDirectsAtTime = directsData.filter(dr => dr.registrationTime <= childNode.registrationTime && dr.totalDeposits >= 50).length;

              if (depositVal >= 50 && currentSponsorDeposit >= 50 && qualifiedDirectsAtTime >= curr.level + 1) {
                const pct = levelIncomePercentages[curr.level]; // Level 1 is index 0
                const amount = (depositVal * pct) / 10000;
                if (amount > 0) {
                  list.push({
                    type: "level_income",
                    typeName: "Level Income",
                    fromUser: childAddr,
                    amount: amount,
                    level: curr.level + 1,
                    timestamp: childNode.registrationTime,
                    status: "Completed",
                    txHash: `0x_linc_${childAddr.toLowerCase()}_${curr.level + 1}`,
                    blockNumber: 0
                  });
                }
              }
              queue.push({ address: childAddr, level: curr.level + 1 });
            }
          }
        });
      }
    }

    if (numDays <= 0) {
      console.log("Simulating ledger exit: numDays <= 0 after level income simulation");
      return list;
    }

    // Helper to calculate booster rate on a given timestamp
    function getBoosterRateAtTime(timestamp) {
      let refs5 = 0, refs10 = 0, refs15 = 0, refs20 = 0, refs25 = 0;
      for (const d of directsData) {
        if (d.registrationTime > timestamp) continue;
        if (d.registrationTime > sponsorJoin + 25 * ONE_DAY_SECS) continue;

        const currentSponsorDeposit = getActiveDepositAtTime(timestamp);
        if (d.totalDeposits >= currentSponsorDeposit) {
          if (d.registrationTime >= sponsorJoin) {
            const diff = d.registrationTime - sponsorJoin;
            if (diff <= 5 * ONE_DAY_SECS) refs5++;
            if (diff <= 10 * ONE_DAY_SECS) refs10++;
            if (diff <= 15 * ONE_DAY_SECS) refs15++;
            if (diff <= 20 * ONE_DAY_SECS) refs20++;
            if (diff <= 25 * ONE_DAY_SECS) refs25++;
          }
        }
      }

      if (refs25 >= 10) return 500;
      if (refs20 >= 8) return 250;
      if (refs15 >= 6) return 200;
      if (refs10 >= 4) return 150;
      if (refs5 >= 2) return 100;
      return 50;
    }

    // Initialize sponsor's cumulative earnings tracker
    let sponsorCumulativeTotalEarned = 0;

    // 1. Generate Daily & Booster ROI Payouts
    for (let d = 1; d <= numDays; d++) {
      const dayTime = sponsorJoin + d * ONE_DAY_SECS;
      const dayStart = dayTime - ONE_DAY_SECS;
      const rateBps = getBoosterRateAtTime(dayTime);
      const currentDeposit = getActiveDepositAtTime(dayTime);
      const maxRoiCap = currentDeposit * 2.2;
      const maxNetworkCap = currentDeposit * 4.0;
      const sponsorMaxLimit = Math.min(maxRoiCap, maxNetworkCap);

      // Add any simulated Level Income from list that occurred on this day and is after lastUpdateROI
      list.forEach(tx => {
        if (tx.type === "level_income" && tx.timestamp > Number(userData.lastUpdateROI) && tx.timestamp > dayStart && tx.timestamp <= dayTime) {
          let allowedIncome = tx.amount;
          if (sponsorCumulativeTotalEarned >= maxNetworkCap) {
            allowedIncome = 0;
          } else if (sponsorCumulativeTotalEarned + tx.amount > maxNetworkCap) {
            allowedIncome = maxNetworkCap - sponsorCumulativeTotalEarned;
          }
          tx.amount = allowedIncome; // update simulated amount
          sponsorCumulativeTotalEarned += allowedIncome;
        }
      });

      // Daily ROI (Includes booster if active)
      let dailyRoiAmt = (currentDeposit * rateBps) / 10000;
      
      let actualDailyRoi = dailyRoiAmt;
      if (sponsorCumulativeTotalEarned >= sponsorMaxLimit) {
        actualDailyRoi = 0;
      } else if (sponsorCumulativeTotalEarned + dailyRoiAmt > sponsorMaxLimit) {
        actualDailyRoi = sponsorMaxLimit - sponsorCumulativeTotalEarned;
      }
      
      sponsorCumulativeTotalEarned += actualDailyRoi;
      
      if (actualDailyRoi > 0) {
        const isBoosted = rateBps > 50;
        list.push({
          type: "roi",
          typeName: isBoosted ? "Daily & Booster ROI Payout" : "Daily ROI Payout",
          fromUser: "Contract",
          amount: actualDailyRoi,
          level: "-",
          timestamp: dayTime,
          status: "Completed",
          txHash: `0x_roi_${d}`,
          blockNumber: 0
        });
      }

    }

    // 2. Level ROI Matching (up to 20 generations)
    // Traverses downline tree up to 20 levels to gather all downlines and simulate their Level ROI Matching payouts
    const levelROIPercentages = [
      1500, 1000, 500, 500, 500, 400, 400, 400, 400, 400,
      300, 300, 300, 300, 300, 200, 200, 200, 200, 200
    ];
    const downlinesForROI = [];
    const roiQueue = [{ address: addr, level: 0 }];
    const roiVisited = new Set([addr.toLowerCase()]);
    
    let roiHead = 0;
    while (roiHead < roiQueue.length) {
      const curr = roiQueue[roiHead++];
      if (curr.level >= 20) continue;
      
      const currNode = curr.address.toLowerCase() === addr.toLowerCase()
        ? { children: directs || directsList }
        : (loadedDirectsMap[curr.address.toLowerCase()] || treeNodes[curr.address.toLowerCase()]);
        
      if (currNode && currNode.children) {
        currNode.children.forEach(childAddr => {
          const childKey = childAddr.toLowerCase();
          if (!roiVisited.has(childKey)) {
            roiVisited.add(childKey);
            const childNode = loadedDirectsMap[childKey] || treeNodes[childKey];
            if (childNode) {
              downlinesForROI.push({
                address: childAddr,
                level: curr.level + 1,
                registrationTime: Number(childNode.registrationTime || 0),
                totalDeposits: parseFloat(childNode.totalDeposits || 0),
                node: childNode
              });
              roiQueue.push({ address: childAddr, level: curr.level + 1 });
            }
          }
        });
      }
    }

    downlinesForROI.forEach(child => {
      if (child.totalDeposits < 50) return;

      const numChildDays = Math.floor((now - child.registrationTime) / ONE_DAY_SECS);
      if (numChildDays <= 0) return;

      const childNode = child.node;
      
      let childNonRoi = 0;
      if (childNode) {
        childNonRoi = parseFloat(childNode.levelIncomeEarned || 0)
          + parseFloat(childNode.levelROIEarned || 0)
          + parseFloat(childNode.performanceBonusEarned || 0);
      }
      let childCumulative = childNonRoi;

      for (let k = 1; k <= numChildDays; k++) {
        const matchTime = child.registrationTime + k * ONE_DAY_SECS;

        // Determine child's booster rate at the matching time
        let childRateBps = 50;
        if (childNode && childNode.children && childNode.children.length > 0) {
          const childDirectsData = [];
          childNode.children.forEach(gcAddr => {
            const gcNode = loadedDirectsMap[gcAddr.toLowerCase()] || treeNodes[gcAddr.toLowerCase()];
            if (gcNode) {
              childDirectsData.push({
                registrationTime: Number(gcNode.registrationTime || 0),
                totalDeposits: parseFloat(gcNode.totalDeposits || 0)
              });
            }
          });
          
          let cRefs5 = 0, cRefs10 = 0, cRefs15 = 0, cRefs20 = 0, cRefs25 = 0;
          for (const gc of childDirectsData) {
            if (gc.registrationTime > matchTime) continue;
            if (gc.registrationTime > child.registrationTime + 25 * ONE_DAY_SECS) continue;
            if (gc.totalDeposits >= child.totalDeposits) {
              if (gc.registrationTime >= child.registrationTime) {
                const diff = gc.registrationTime - child.registrationTime;
                if (diff <= 5 * ONE_DAY_SECS) cRefs5++;
                if (diff <= 10 * ONE_DAY_SECS) cRefs10++;
                if (diff <= 15 * ONE_DAY_SECS) cRefs15++;
                if (diff <= 20 * ONE_DAY_SECS) cRefs20++;
                if (diff <= 25 * ONE_DAY_SECS) cRefs25++;
              }
            }
          }
          if (cRefs25 >= 10) childRateBps = 500;
          else if (cRefs20 >= 8) childRateBps = 250;
          else if (cRefs15 >= 6) childRateBps = 200;
          else if (cRefs10 >= 4) childRateBps = 150;
          else if (cRefs5 >= 2) childRateBps = 100;
        }

        const childRoiAmt = (child.totalDeposits * childRateBps) / 10000;
        const childMaxROI = child.totalDeposits * 2.2;
        let actualChildRoi = childRoiAmt;
        if (childCumulative >= childMaxROI) {
          actualChildRoi = 0;
        } else if (childCumulative + childRoiAmt > childMaxROI) {
          actualChildRoi = childMaxROI - childCumulative;
        }
        
        childCumulative += actualChildRoi;

        // Check if sponsor qualifies at matchTime
        const sponsorDeposit = getActiveDepositAtTime(matchTime);
        const qualifiedDirectsOnDay = directsData.filter(dr => dr.registrationTime <= matchTime && dr.totalDeposits >= 50).length;

        if (sponsorDeposit >= 50 && qualifiedDirectsOnDay >= child.level && actualChildRoi > 0) {
          const levelRoiPct = levelROIPercentages[child.level - 1] || 0;
          const levelRoiCommission = (actualChildRoi * levelRoiPct) / 10000;
          
          if (levelRoiCommission > 0) {
            list.push({
              type: "level_roi",
              typeName: "Level ROI Matching",
              fromUser: child.address,
              amount: levelRoiCommission,
              level: child.level,
              timestamp: matchTime,
              status: "Completed",
              txHash: `0x_lroi_${child.address.toLowerCase()}_${k}`,
              blockNumber: 0
            });
          }
        }
      }
    });

    // 3. Generate Performance Daily Salaries
    activeBonuses.forEach((bonus, bIdx) => {
      const streamStart = bonus.startTime;
      const streamEnd = Math.min(now, bonus.endTime);
      const streamDays = Math.floor((streamEnd - streamStart) / PERF_ONE_DAY_SECS);
      
      for (let day = 1; day <= streamDays; day++) {
        const salaryTime = streamStart + day * PERF_ONE_DAY_SECS;
        
        // Cap by the 400% Network Cap
        const currentDeposit = getActiveDepositAtTime(salaryTime);
        const maxNetworkCap = currentDeposit * 4.0;
        
        let salaryAmt = bonus.dailyRate;
        if (sponsorCumulativeTotalEarned >= maxNetworkCap) {
          salaryAmt = 0;
        } else if (sponsorCumulativeTotalEarned + bonus.dailyRate > maxNetworkCap) {
          salaryAmt = maxNetworkCap - sponsorCumulativeTotalEarned;
        }
        sponsorCumulativeTotalEarned += salaryAmt;
        
        if (salaryAmt > 0) {
          list.push({
            type: "perf_daily",
            typeName: "Performance Daily Salary",
            fromUser: "Contract",
            amount: salaryAmt,
            level: "-",
            timestamp: salaryTime,
            status: "Completed",
            txHash: `0x_salary_${bIdx}_${day}`,
            blockNumber: 0
          });
        }
      }
    });

    return list;
  }

  // Event fetching logic removed, replaced with exact tracking arrays

  // Mint Test USDT (Mock Token Only)
  async function handleMintUSDT() {
    if (!walletConnected) {
      alert("Please connect wallet first");
      return;
    }
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, signer);
      
      const tx = await usdtContract.mint(walletAddress, ethers.parseUnits("500", 18));
      await tx.wait();
      
      alert("500 Test USDT minted to your wallet!");
      await loadBlockchainData(walletAddress);
    } catch (err) {
      console.error(err);
      alert("Mint failed. Verify you are using the Mock USDT contract.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Deposit
  async function handleDeposit(e) {
    e.preventDefault();
    if (!walletConnected) {
      alert("Please connect wallet first");
      return;
    }
    const val = parseFloat(depositAmount);
    if (isNaN(val) || val < 10) {
      alert("Minimum deposit is 10 USDT");
      return;
    }

    // Upline required for new users
    if (!isRegistered && (!sponsorAddress || !ethers.isAddress(sponsorAddress))) {
      alert("A valid Sponsor Ethereum Address is required to register.");
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, signer);
      const dtContract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, signer);

      const parsedAmount = ethers.parseUnits(depositAmount, 18);

      // Check allowance
      const allowance = await usdtContract.allowance(walletAddress, dtInfinityAddress);
      if (allowance < parsedAmount) {
        const approveTx = await usdtContract.approve(dtInfinityAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      // Trigger Deposit
      const sponsor = isRegistered ? ethers.ZeroAddress : sponsorAddress;
      const tx = await dtContract.deposit(parsedAmount, sponsor);
      const receipt = await tx.wait();

      alert("Deposit processed successfully!");
      await loadBlockchainData(walletAddress);
      setActiveView("dashboard");
    } catch (err) {
      console.error(err);
      alert("Transaction failed or rejected. Please verify contract addresses and balance.");
    } finally {
      setLoading(false);
    }
  }

  // Handle manual withdrawal claim
  async function handleWithdraw(e) {
    e.preventDefault();
    if (!walletConnected) {
      alert("Please connect wallet first");
      return;
    }
    const val = parseFloat(withdrawAmount);
    if (isNaN(val) || val <= 0) {
      alert("Please enter a valid withdraw amount");
      return;
    }

    const available = parseFloat(userData.claimableBalance) + 
      parseFloat(pendingBalances.pendingDaily) + 
      parseFloat(pendingBalances.pendingBooster) + 
      parseFloat(pendingBalances.pendingPerf);

    if (val > available) {
      alert("Withdraw amount exceeds available balance");
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const dtContract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, signer);

      const tx = await dtContract.withdraw(ethers.parseUnits(withdrawAmount, 18));
      const receipt = await tx.wait();

      alert("Withdrawal claim processed successfully!");
      setWithdrawAmount("");
      await loadBlockchainData(walletAddress);
    } catch (err) {
      console.error(err);
      alert("Withdrawal transaction failed or was rejected.");
    } finally {
      setLoading(false);
    }
  }

  // Claim All Rewards at once
  async function handleClaimAll() {
    if (!walletConnected) {
      alert("Please connect wallet first");
      return;
    }
    const available = parseFloat(userData.claimableBalance) + 
      parseFloat(pendingBalances.pendingDaily) + 
      parseFloat(pendingBalances.pendingBooster) + 
      parseFloat(pendingBalances.pendingPerf);

    if (available <= 0) {
      alert("No available rewards to claim");
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const dtContract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, signer);

      const tx = await dtContract.claimAll();
      const receipt = await tx.wait();

      alert("All rewards claimed and transferred successfully!");
      await loadBlockchainData(walletAddress);
    } catch (err) {
      console.error(err);
      alert("Claim transaction failed or was rejected.");
    } finally {
      setLoading(false);
    }
  }

  // Claim Performance Bonus (choose between Instant or Daily Stream)
  async function handleClaimPerformance(tierIndex, chooseInstant) {
    if (!walletConnected) {
      alert("Please connect wallet first");
      return;
    }
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const dtContract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, signer);

      const tx = await dtContract.claimPerformanceBonus(tierIndex, chooseInstant);
      await tx.wait();

      alert(`Performance Bonus Tier ${tierIndex + 1} claimed successfully!`);
      await loadBlockchainData(walletAddress);
    } catch (err) {
      console.error(err);
      alert("Failed to claim Performance Bonus. Verify the claim window is active.");
    } finally {
      setLoading(false);
    }
  }

  // Copy referral link
  function copyReferralLink() {
    if (!walletConnected) return;
    const link = `${origin}/?ref=${walletAddress}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopyText("Copied");
      setTimeout(() => setCopyText("Copy"), 1500);
    });
  }

  // Listen to provider events on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccounts = (accounts) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setWalletConnected(true);
          loadBlockchainData(accounts[0]);
        } else {
          setWalletAddress("");
          setWalletConnected(false);
        }
      };

      const handleChain = () => {
        window.location.reload();
      };

      window.ethereum.on("accountsChanged", handleAccounts);
      window.ethereum.on("chainChanged", handleChain);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccounts);
        window.ethereum.removeListener("chainChanged", handleChain);
      };
    }
  }, [dtInfinityAddress, usdtAddress, targetChainId]);

  // --- REAL-TIME TICKING SIMULATION CALCULATIONS ---
  const totalDepositsNum = parseFloat(userData.totalDeposits) || 0;
  const boosterRatePercent = parseFloat(userData.boosterRate) || 0.5; // E.g., 5.0 for 5.0%
  const oneDaySec = Number(oneDay) || 86400;

  // Accrual rates per second
  const dailyRoiRatePerSecond = (totalDepositsNum * 0.005) / oneDaySec;
  const boosterRateDiff = Math.max(0, (boosterRatePercent / 100) - 0.005);
  const boosterRoiRatePerSecond = (totalDepositsNum * boosterRateDiff) / oneDaySec;

  // Performance Bonus daily rate
  let activePerfDailySum = 0;
  if (isRegistered) {
    const strongVol = parseFloat(userData.strongestLegVolume);
    const totalVol = parseFloat(userData.totalTeamVolume);
    const otherVol = totalVol - strongVol;
    PERFORMANCE_TIERS.forEach(tier => {
      if (strongVol >= tier.target && otherVol >= tier.target) {
        activePerfDailySum += tier.daily;
      }
    });
  }
  const perfRoiRatePerSecond = activePerfDailySum / oneDaySec;

  // Dynamic Level ROI accumulated calculation based on loaded downline nodes' actual elapsed time
  const calculateAccumulatedLevelRoi = () => {
    if (!isRegistered || !treeRoot || !treeNodes[treeRoot.toLowerCase()]) return 0;
    
    let totalAccrued = 0;
    const rootNode = treeNodes[treeRoot.toLowerCase()];
    const qualifiedDirects = rootNode.qualifiedDirectsCount;
    const currentTime = Math.floor(Date.now() / 1000);
    
    const percentages = [
      1500, 1000, 500, 500, 500,
      400, 400, 400, 400, 400,
      300, 300, 300, 300, 300,
      200, 200, 200, 200, 200
    ];

    Object.keys(treeNodes).forEach(addr => {
      if (addr === treeRoot.toLowerCase()) return;
      const node = treeNodes[addr];
      
      let depth = 1;
      let curr = node;
      let pathValid = false;
      
      for (let i = 0; i < 30; i++) {
        if (!curr.sponsor || curr.sponsor === ethers.ZeroAddress) break;
        if (curr.sponsor.toLowerCase() === treeRoot.toLowerCase()) {
          pathValid = true;
          break;
        }
        const parentNode = treeNodes[curr.sponsor.toLowerCase()];
        if (!parentNode) break;
        curr = parentNode;
        depth++;
      }
      
      if (pathValid && depth <= 20 && qualifiedDirects >= depth) {
        const pct = percentages[depth - 1];
        const deposits = parseFloat(node.totalDeposits) || 0;
        const boosterRate = node.boosterRate || 0.5;
        
        // Calculate downline elapsed seconds since their last update
        const lastUpdate = Number(node.lastUpdateROI) || currentTime;
        const elapsed = Math.max(0, currentTime - lastUpdate);
        
        // Downline's pending ROI
        let pending = (deposits * (boosterRate / 100) * elapsed) / oneDaySec;
        
        // Enforce downline's 220% ROI cap
        const maxRoiLimit = deposits * 2.2;
        const earned = parseFloat(node.dailyROIEarned || 0) + parseFloat(node.roiBoosterEarned || 0);
        if (earned + pending > maxRoiLimit) {
          pending = Math.max(0, maxRoiLimit - earned);
        }
        
        // User's commission from that ROI
        const commission = (pending * pct) / 10000;
        totalAccrued += commission;
      }
    });
    
    return totalAccrued;
  };

  // Accrued offsets since last blockchain update
  const simulatedDailyOffset = dailyRoiRatePerSecond * secondsSinceSync;
  const simulatedBoosterOffset = boosterRoiRatePerSecond * secondsSinceSync;
  const simulatedPerfOffset = perfRoiRatePerSecond * secondsSinceSync;
  const simulatedLevelRoiOffset = calculateAccumulatedLevelRoi();

  // Initial values
  const initialTotalEarned = 
    parseFloat(userData.levelIncomeEarned) +
    parseFloat(userData.levelROIEarned) +
    parseFloat(userData.performanceBonusEarned) +
    parseFloat(userData.dailyROIEarned) +
    parseFloat(userData.roiBoosterEarned);

  const initialPendingROI = parseFloat(pendingBalances.pendingDaily) + parseFloat(pendingBalances.pendingBooster);
  
  // Enforce 220% ROI Cap
  const maxRoiCap = totalDepositsNum * 2.2;
  let totalPendingROI = initialPendingROI + simulatedDailyOffset + simulatedBoosterOffset;
  if (initialTotalEarned + totalPendingROI > maxRoiCap) {
    totalPendingROI = Math.max(0, maxRoiCap - initialTotalEarned);
  }

  // Split capped pending ROI back into daily & booster
  let displayPendingDaily = 0;
  let displayPendingBooster = 0;
  const totalBoosterRate = boosterRatePercent / 100;
  if (totalBoosterRate > 0) {
    displayPendingDaily = (totalPendingROI * 0.005) / totalBoosterRate;
    displayPendingBooster = totalPendingROI - displayPendingDaily;
  }

  // Enforce 400% Capping Limit (across all 6 streams)
  const maxNetworkCap = totalDepositsNum * 4.0;

  let displayPendingLevelROI = simulatedLevelRoiOffset;
  let displayPendingPerf = parseFloat(pendingBalances.pendingPerf) + simulatedPerfOffset;
  const totalSimulatedPending = displayPendingDaily + displayPendingBooster + displayPendingPerf + displayPendingLevelROI;

  if (initialTotalEarned + totalSimulatedPending > maxNetworkCap) {
    const remainingCap = Math.max(0, maxNetworkCap - initialTotalEarned);
    if (totalPendingROI > remainingCap) {
      displayPendingDaily = (remainingCap * 0.005) / totalBoosterRate;
      displayPendingBooster = remainingCap - displayPendingDaily;
      displayPendingLevelROI = 0;
      displayPendingPerf = 0;
    } else if (totalPendingROI + displayPendingLevelROI > remainingCap) {
      displayPendingLevelROI = remainingCap - totalPendingROI;
      displayPendingPerf = 0;
    } else {
      displayPendingPerf = remainingCap - totalPendingROI - displayPendingLevelROI;
    }
  }

  // Display-ready values calculated chronologically from txs list
  const txs = useMemo(() => {
    if (!walletConnected || !isRegistered) return [];

    // 1. Generate simulated ledger records for accumulations using current treeNodes
    const basicInfoMock = {
      registrationTime: BigInt(userData.registrationTime),
      totalDeposits: ethers.parseUnits(userData.totalDeposits, 18),
      totalWithdrawn: ethers.parseUnits(userData.totalWithdrawn, 18)
    };
    const incomeInfoMock = {
      levelIncomeEarned: ethers.parseUnits(userData.levelIncomeEarned, 18),
      levelROIEarned: ethers.parseUnits(userData.levelROIEarned, 18),
      performanceBonusEarned: ethers.parseUnits(userData.performanceBonusEarned, 18),
      dailyROIEarned: ethers.parseUnits(userData.dailyROIEarned, 18),
      roiBoosterEarned: ethers.parseUnits(userData.roiBoosterEarned, 18)
    };

    const simulatedTxs = generateSimulatedLedger(
      walletAddress,
      basicInfoMock,
      incomeInfoMock,
      directsList,
      oneDay,
      treeNodes,
      onChainEvents.filter(e => e.type === "deposit"),
      perfOneDay
    );

    // 2. Combine with onChainEvents, filtering out simulated duplicates
    const simulatedFiltered = simulatedTxs.filter(sim => {
      const isDuplicate = onChainEvents.some(onChain => 
        onChain.type === sim.type && 
        onChain.fromUser.toLowerCase() === sim.fromUser.toLowerCase() && 
        Math.abs(onChain.timestamp - sim.timestamp) < 60
      );
      return !isDuplicate;
    });

    let combinedTxs = [...onChainEvents, ...simulatedFiltered];

    // Ensure fundamental transactions exist
    const mockTime = userData.registrationTime;
    const userDeposits = parseFloat(userData.totalDeposits);
    if (userDeposits > 0) {
      // Sum up all on-chain deposit events found
      const onChainDepositsSum = combinedTxs
        .filter(t => t.type === "deposit" && t.txHash !== "0x_fallback_deposit")
        .reduce((sum, t) => sum + t.amount, 0);

      // If the sum of found deposits is less than total deposits from the contract state,
      // add a fallback transaction for the missing difference at the registration time.
      if (onChainDepositsSum < userDeposits - 0.01) {
        const missingDepositAmount = userDeposits - onChainDepositsSum;
        combinedTxs.push({
          type: "deposit",
          typeName: "Deposit",
          fromUser: "Self",
          amount: missingDepositAmount,
          level: "-",
          timestamp: mockTime,
          status: "Completed",
          txHash: "0x_fallback_deposit",
          blockNumber: 0
        });
      }
    }

    const userWithdrawn = parseFloat(userData.totalWithdrawn);
    if (userWithdrawn > 0) {
      // Sum up all on-chain withdrawal events found
      const onChainWithdrawalsSum = combinedTxs
        .filter(t => t.type === "withdraw" && t.txHash !== "0x_fallback_withdraw")
        .reduce((sum, t) => sum + t.amount, 0);

      // If the sum of found withdrawals is less than total withdrawn from the contract state,
      // add a fallback transaction for the missing difference.
      if (onChainWithdrawalsSum < userWithdrawn - 0.01) {
        const missingWithdrawalAmount = userWithdrawn - onChainWithdrawalsSum;
        combinedTxs.push({
          type: "withdraw",
          typeName: "Withdrawal",
          fromUser: "Self",
          amount: missingWithdrawalAmount,
          level: "-",
          timestamp: mockTime + 86400,
          status: "Completed",
          txHash: "0x_fallback_withdraw",
          blockNumber: 0
        });
      }
    }

    const simulatedLevelIncSum = combinedTxs.filter(t => t.type === "level_income").reduce((s, t) => s + t.amount, 0);
    const totalLevelIncOnChain = parseFloat(userData.levelIncomeEarned);
    const diff = totalLevelIncOnChain - simulatedLevelIncSum;
    if (diff > 0.01) {
      combinedTxs.push({
        type: "level_income",
        typeName: "Level Income",
        fromUser: "Deeper Downline",
        amount: diff,
        level: ">1",
        timestamp: mockTime + 1800,
        status: "Completed",
        txHash: "0x_fallback_level_inc",
        blockNumber: 0
      });
    }

    // Performance Bonus: compare total on-chain claimed performance bonus with simulated daily performance bonus stream
    // that has been claimed on-chain and any already found on-chain instant payouts. The difference represents the fallback instant payouts.
    const foundPerfInstantSum = combinedTxs
      .filter(t => t.type === "perf_instant" && t.txHash !== "0x_synthetic_perf_instant")
      .reduce((sum, t) => sum + t.amount, 0);

    let simulatedPerfDailyClaimedSum = 0;
    combinedTxs.forEach(t => {
      if (t.type === "perf_daily") {
        const activeBonus = activeBonuses.find(b => t.timestamp >= b.startTime && t.timestamp <= b.endTime);
        if (activeBonus) {
          if (t.timestamp <= activeBonus.lastClaimTime) {
            simulatedPerfDailyClaimedSum += t.amount;
          }
        }
      }
    });

    const totalPerfClaimedOnChain = parseFloat(userData.performanceBonusEarned || 0);
    const perfInstantDiff = totalPerfClaimedOnChain - (simulatedPerfDailyClaimedSum + foundPerfInstantSum);
    if (perfInstantDiff > 0.01) {
      combinedTxs.push({
        type: "perf_instant",
        typeName: "Performance Bonus (Instant)",
        fromUser: "Contract",
        amount: perfInstantDiff,
        level: "-",
        timestamp: mockTime + 1800, // fallback: 30 minutes after registration
        status: "Completed",
        txHash: "0x_synthetic_perf_instant",
        blockNumber: 0
      });
    }

    // 3. Apply chronological capping
    combinedTxs.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.type === "deposit" && b.type !== "deposit") return -1;
      if (a.type !== "deposit" && b.type === "deposit") return 1;
      return 0;
    });

    let runningTotalEarned = 0;
    let runningROIEarned = 0;
    let runningDeposit = 0;

    combinedTxs = combinedTxs.map(tx => {
      if (tx.type === "deposit") {
        runningDeposit += tx.amount;
        return tx;
      }
      if (tx.type === "withdraw") {
        return tx;
      }
      if (tx.type === "performance" && tx.typeName.includes("Achieved")) {
        return tx;
      }
      
      const maxNetwork = runningDeposit * 4;
      const maxROI = runningDeposit * 2.2;
      
      const allowedNetwork = Math.max(0, maxNetwork - runningTotalEarned);
      let allowed = tx.amount;
      
      if (tx.type === "roi" || tx.type === "booster_roi") {
        const allowedROI = Math.max(0, maxROI - runningTotalEarned);
        allowed = Math.min(tx.amount, allowedNetwork, allowedROI);
        runningROIEarned += allowed;
      } else {
        allowed = Math.min(tx.amount, allowedNetwork);
      }
      
      runningTotalEarned += allowed;
      
      return {
        ...tx,
        amount: allowed
      };
    });

    // 4. Sort descending for display
    combinedTxs.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      if (a.type === "deposit" && b.type !== "deposit") return 1;
      if (a.type !== "deposit" && b.type === "deposit") return -1;
      return 0;
    });

    return combinedTxs;
  }, [onChainEvents, treeNodes, userData, directsList, oneDay, perfOneDay, activeBonuses, walletConnected, isRegistered]);

  // Display-ready values calculated chronologically from txs list
  const statsToDisplay = useMemo(() => {
    // Fallback if txs is empty
    if (txs.length === 0) {
      const dailyROI = parseFloat(userData.dailyROIEarned) + displayPendingDaily;
      const boosterROI = parseFloat(userData.roiBoosterEarned) + displayPendingBooster;
      const levelIncome = parseFloat(userData.levelIncomeEarned);
      const levelROI = parseFloat(userData.levelROIEarned) + displayPendingLevelROI;
      const performance = parseFloat(userData.performanceBonusEarned) + displayPendingPerf;
      return {
        dailyROI: dailyROI.toFixed(2),
        boosterROI: boosterROI.toFixed(2),
        levelIncome: levelIncome.toFixed(2),
        levelROI: levelROI.toFixed(2),
        performance: performance.toFixed(2),
        totalROI: (dailyROI + boosterROI).toFixed(2),
        totalEarned: (dailyROI + boosterROI + levelIncome + levelROI + performance).toFixed(2),
        totalAvailable: (
          parseFloat(userData.claimableBalance) +
          displayPendingDaily +
          displayPendingBooster +
          displayPendingLevelROI +
          displayPendingPerf
        ).toFixed(2)
      };
    }

    let dailyROI = 0;
    let boosterROI = 0;
    let levelIncome = 0;
    let levelROI = 0;
    let perfDaily = 0;
    let perfInstant = 0;

    txs.forEach(tx => {
      if (tx.type === "roi") dailyROI += tx.amount;
      else if (tx.type === "booster_roi") boosterROI += tx.amount;
      else if (tx.type === "level_income") levelIncome += tx.amount;
      else if (tx.type === "level_roi") levelROI += tx.amount;
      else if (tx.type === "perf_daily") perfDaily += tx.amount;
      else if (tx.type === "perf_instant") perfInstant += tx.amount;
    });

    const performance = perfDaily + perfInstant;
    const totalEarned = dailyROI + boosterROI + levelIncome + levelROI + performance;
    const totalAccruedClaimable = dailyROI + boosterROI + levelROI + perfDaily;
    const totalWithdrawnVal = parseFloat(userData.totalWithdrawn) || 0;
    const totalAvailable = Math.max(0, totalAccruedClaimable - totalWithdrawnVal);

    return {
      dailyROI: dailyROI.toFixed(2),
      boosterROI: boosterROI.toFixed(2),
      levelIncome: levelIncome.toFixed(2),
      levelROI: levelROI.toFixed(2),
      performance: performance.toFixed(2),
      totalROI: (dailyROI + boosterROI).toFixed(2),
      totalEarned: totalEarned.toFixed(2),
      totalAvailable: totalAvailable.toFixed(2)
    };
  }, [txs, userData, displayPendingDaily, displayPendingBooster, displayPendingLevelROI, displayPendingPerf]);

  const displayDailyROI = parseFloat(statsToDisplay.dailyROI).toFixed(2);
  const displayBoosterROI = parseFloat(statsToDisplay.boosterROI).toFixed(2);
  const displayPerformanceBonus = parseFloat(statsToDisplay.performance).toFixed(2);
  const displayLevelROI = parseFloat(statsToDisplay.levelROI).toFixed(2);
  const displayLevelIncome = parseFloat(statsToDisplay.levelIncome).toFixed(2);

  const totalAvailableBalance = parseFloat(statsToDisplay.totalAvailable).toFixed(2);
  const totalEarnedAcrossStreams = parseFloat(statsToDisplay.totalEarned).toFixed(2);

  const currentRoiEarned = parseFloat(statsToDisplay.totalEarned);
  const roiCapPercent = maxRoiCap > 0 ? Math.min((currentRoiEarned / maxRoiCap) * 100, 100) : 0;

  const currentNetworkEarned = parseFloat(statsToDisplay.totalEarned);
  const networkCapPercent = maxNetworkCap > 0 ? Math.min((currentNetworkEarned / maxNetworkCap) * 100, 100) : 0;

  // Filtered transactions and sum for selection
  const filteredTxs = useMemo(() => {
    return txs.filter(tx => {
      // 1. Filter Type
      if (filterType !== "all") {
        if (filterType === "deposit" && tx.type !== "deposit") return false;
        if (filterType === "withdraw" && tx.type !== "withdraw") return false;
        if (filterType === "roi" && tx.type !== "roi") return false;
        if (filterType === "booster_roi" && tx.type !== "booster_roi") return false;
        if (filterType === "level_income" && tx.type !== "level_income") return false;
        if (filterType === "level_roi" && tx.type !== "level_roi") return false;
        if (filterType === "performance" && !["perf_instant", "perf_daily", "perf_claim"].includes(tx.type)) return false;
      }
      
      // 2. Filter Level (Dropdown)
      if (filterLevel !== "all" && tx.level.toString() !== filterLevel) {
        return false;
      }

      // 3. Search Level (Text input)
      if (searchLevel && tx.level.toString().toLowerCase() !== searchLevel.trim().toLowerCase()) {
        return false;
      }

      // 4. Date Range
      if (filterStartDate) {
        const startSecs = new Date(filterStartDate).getTime() / 1000;
        if (tx.timestamp < startSecs) return false;
      }
      if (filterEndDate) {
        const endSecs = new Date(filterEndDate).getTime() / 1000 + 86400; // include end date full day
        if (tx.timestamp > endSecs) return false;
      }

      // 5. Search fromUser (wallet address)
      if (searchFromUser) {
        const searchStr = searchFromUser.trim().toLowerCase();
        if (!tx.fromUser.toLowerCase().includes(searchStr)) return false;
      }

      return true;
    });
  }, [txs, filterType, filterLevel, searchLevel, filterStartDate, filterEndDate, searchFromUser]);

  const totalSelectedIncome = useMemo(() => {
    const incomeTypes = ["roi", "booster_roi", "level_income", "level_roi", "perf_instant", "perf_daily"];
    return filteredTxs
      .filter(tx => incomeTypes.includes(tx.type))
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const itemsPerPage = 20;
  const paginatedTxs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTxs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTxs, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTxs.length / itemsPerPage));

  // Recursive Component for Tree Rendering
  function TreeNodeComponent({ addr, depth = 0 }) {
    const normalizedAddr = addr.toLowerCase();
    const node = treeNodes[normalizedAddr];
    const isExpanded = !!node;
    const isSelected = selectedNode?.toLowerCase() === normalizedAddr;

    const handleNodeClick = async (e) => {
      e.stopPropagation();
      setSelectedNode(addr);
      if (!isExpanded) {
        setLoading(true);
        await loadTreeNode(addr);
        setLoading(false);
      }
    };

    return (
      <div className="tree-branch-wrapper">
        <div 
          className={`tree-node-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : 'collapsed'}`}
          onClick={handleNodeClick}
        >
          <div className="tree-node-icon">
            {depth === 0 ? "👑" : "👤"}
          </div>
          <div className="tree-node-info">
            <div className="tree-node-addr mono">{shorten(addr)}</div>
            {node && (
              <div className="tree-node-meta">
                <span>Pkg: {parseFloat(node.totalDeposits).toFixed(0)}</span> · <span>Vol: {parseFloat(node.totalTeamVolume).toFixed(0)}</span>
              </div>
            )}
            {!node && <div className="tree-node-meta click-to-expand">Click to expand</div>}
          </div>
        </div>

        {isExpanded && node.children && node.children.length > 0 && (
          <div className="tree-children-container">
            {node.children.map((childAddr, idx) => (
              <TreeNodeComponent key={idx} addr={childAddr} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (walletConnected && isWrongNetwork) {
    return (
      <div className="connect-landing">
        <div className="connect-card" style={{ borderColor: "var(--down)", boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5), 0 0 40px rgba(242, 112, 94, 0.05)" }}>
          <div className="connect-brand">
            <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "56px", objectFit: "contain", marginBottom: "16px" }} />
            <p className="connect-subtitle" style={{ color: "var(--down)", fontWeight: "600", fontSize: "14px", textTransform: "uppercase", letterSpacing: "1px" }}>Wrong Network</p>
          </div>
          
          <div className="connect-divider"></div>
          
          <div className="connect-body">
            <p className="connect-message">
              Your wallet is connected to <strong style={{ color: "var(--text)" }}>{networkName}</strong>. 
              However, this platform is configured to run on <strong style={{ color: "var(--blue-bright)" }}>{targetChainId === 97n ? "BSC Testnet" : "BSC Mainnet"}</strong>.
            </p>
            
            <button className="connect-btn display" style={{ background: "var(--down)", color: "#fff", boxShadow: "0 4px 12px rgba(242, 112, 94, 0.25)" }} onClick={switchNetwork} disabled={loading}>
              {loading ? "Switching Network..." : `Switch to ${targetChainId === 97n ? "BSC Testnet" : "BSC Mainnet"}`}
            </button>
            
            <button 
              className="copy-btn" 
              style={{ width: "100%", padding: "10px", marginTop: "10px", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              onClick={() => {
                setWalletConnected(false);
                setIsWrongNetwork(false);
              }}
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (walletConnected && !isWrongNetwork && !isRegistered) {
    return (
      <div className="connect-landing">
        <div className="connect-card" style={{ maxWidth: "500px" }}>
          <div className="connect-brand">
            <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "56px", objectFit: "contain", marginBottom: "16px" }} />
            <p className="connect-subtitle" style={{ color: "var(--blue-bright)", fontWeight: "600", fontSize: "14px", textTransform: "uppercase", letterSpacing: "1.5px" }}>Join Platform</p>
          </div>
          
          <div className="connect-divider"></div>
          
          <div className="connect-body" style={{ textAlign: "left" }}>
            <div style={{ 
              background: "rgba(94, 200, 242, 0.08)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "12px 15px",
              fontSize: "12.5px",
              color: "var(--text-muted)",
              lineHeight: "1.6",
              marginBottom: "20px"
            }}>
              <strong style={{ color: "var(--blue-bright)" }}>Registration Required:</strong> To activate your node and participate in the Daily ROI & MLM Network, please enter your sponsor&apos;s address and execute your initial deposit (min 10 USDT).
            </div>
            
            <form onSubmit={handleDeposit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div className="field">
                <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Your Wallet Address</label>
                <input 
                  type="text" 
                  value={walletAddress} 
                  disabled 
                  style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px", color: "var(--text-muted)", fontSize: "13px" }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Sponsor / Referrer Address</label>
                <input 
                  type="text" 
                  placeholder="0x..." 
                  value={sponsorAddress}
                  onChange={(e) => setSponsorAddress(e.target.value)}
                  required
                  style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px", color: "var(--text)", fontSize: "13.5px" }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: "11.5px", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Deposit Amount (Min 10 USDT)</label>
                <div style={{ position: "relative" }}>
                  <input 
                    type="number" 
                    placeholder="10" 
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    required
                    style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px", color: "var(--text)", fontSize: "13.5px" }}
                  />
                  <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>USDT</span>
                </div>
              </div>

              <button className="connect-btn display" type="submit" disabled={loading} style={{ marginTop: "15px", marginBottom: "15px" }}>
                {loading ? "Processing..." : "Approve & Register"}
              </button>
            </form>

            <button 
              className="copy-btn" 
              style={{ width: "100%", padding: "10px", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              onClick={() => {
                setWalletConnected(false);
                setWalletAddress("");
              }}
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!walletConnected) {
    return (
      <div className="connect-landing">
        <div className="connect-card">
          <div className="connect-brand">
            <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "56px", objectFit: "contain", marginBottom: "16px" }} />
            <p className="connect-subtitle">Decentralized MLM Network & ROI Platform</p>
          </div>
          
          <div className="connect-divider"></div>
          
          <div className="connect-body">
            <p className="connect-message">
              Please connect your Web3 crypto wallet (such as MetaMask or Trust Wallet) to access your decentralized dashboard, track downline network volume, and claim rewards.
            </p>
            
            <button className="connect-btn display" onClick={connectWallet} disabled={loading}>
              {loading ? "Connecting Wallet..." : "Connect Wallet"}
            </button>
            
            <div className="connect-badge">
              <span className="badge-dot"></span>
              BEP-20 · BNB Chain Supported
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      {/* SIDEBAR OVERLAY FOR MOBILE */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(5, 7, 10, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 15
          }}
        />
      )}
      
      {/* SIDEBAR */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} style={{ zIndex: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="brand" style={{ padding: "0" }}>
            <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "36px", objectFit: "contain" }} />
          </div>
          <button 
            className="mobile-close-btn"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: "none",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px"
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <nav className="nav">
          <div className="nav-label">Overview</div>
          <button 
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`} 
            onClick={() => { setActiveView("dashboard"); setSidebarOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="7" height="9" rx="1.5"/>
              <rect x="14" y="3" width="7" height="5" rx="1.5"/>
              <rect x="14" y="12" width="7" height="9" rx="1.5"/>
              <rect x="3" y="16" width="7" height="5" rx="1.5"/>
            </svg>
            Dashboard
          </button>
          <button 
            className={`nav-item ${activeView === "network" ? "active" : ""}`} 
            onClick={() => { setActiveView("network"); setSidebarOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="5" r="2.2"/>
              <circle cx="5" cy="18" r="2.2"/>
              <circle cx="19" cy="18" r="2.2"/>
              <path d="M12 7.2v4M12 11.2 6.3 16.3M12 11.2l5.7 5.1"/>
            </svg>
            My Network
          </button>
          <button 
            className={`nav-item ${activeView === "history" ? "active" : ""}`} 
            onClick={() => { setActiveView("history"); setSidebarOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8.5"/>
              <path d="M12 7.5V12l3 2"/>
            </svg>
            Income History
          </button>
          
          <div className="nav-label">Funds</div>
          <button 
            className={`nav-item ${activeView === "deposit" ? "active" : ""}`} 
            onClick={() => { setActiveView("deposit"); setSidebarOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 4v16M4 12h16"/>
            </svg>
            New Deposit
          </button>
          <button 
            className={`nav-item ${activeView === "withdraw" ? "active" : ""}`} 
            onClick={() => { setActiveView("withdraw"); setSidebarOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2.5" y="6" width="19" height="13" rx="2"/>
              <path d="M2.5 10h19M6 15h4"/>
            </svg>
            Withdraw
          </button>
          
          <div className="nav-label">Account</div>
          <button 
            className={`nav-item ${activeView === "profile" ? "active" : ""}`} 
            onClick={() => { setActiveView("profile"); setSidebarOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="3.3"/>
              <path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/>
            </svg>
            Profile
          </button>
        </nav>

        <div className="sidebar-foot">
          <div className="package-pill">
            <div className="k">Active Package</div>
            <div className="v">{userData.totalDeposits} USDT</div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button 
              className="mobile-menu-btn" 
              onClick={() => setSidebarOpen(true)}
              style={{
                display: "none",
                background: "none",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                padding: "6px"
              }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
            </button>
            <div className="brand" style={{ display: "none" }}>
              <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "30px", objectFit: "contain" }} />
            </div>
            <div className="title-section">
              <h1 className="display" style={{ textTransform: "capitalize" }}>
                {activeView === "dashboard" ? "Dashboard" : activeView.replace("-", " ")}
              </h1>
              <div className="greet">
                {activeView === "dashboard" && "Welcome back — here's your income overview."}
                {activeView === "network" && "Track referrals and business volume across your network."}
                {activeView === "history" && "Audit all incoming daily commissions and bonus logs."}
                {activeView === "deposit" && "Activate package or increase investment instantly."}
                {activeView === "withdraw" && "Withdraw claimable rewards to your connected wallet."}
                {activeView === "profile" && "Contract configurations and developer test tools."}
              </div>
            </div>
          </div>

          <div className="wallet-box" style={{ gap: "15px" }}>
            <div 
              className="wallet-dot" 
              style={{ 
                background: walletConnected ? "var(--up)" : "var(--text-faint)", 
                boxShadow: walletConnected ? "0 0 8px var(--up)" : "none" 
              }}
            />
            <div>
              <div className="addr">{walletConnected ? shorten(walletAddress) : "Not connected"}</div>
              <div className="net">{networkName}</div>
            </div>
            {walletConnected ? (
              <button 
                onClick={() => {
                  setWalletConnected(false);
                  setIsWrongNetwork(false);
                  setWalletAddress("");
                }} 
                className="copy-btn" 
                style={{ padding: "8px 12px", fontSize: "11px", fontWeight: "600", border: "1px solid var(--border)" }}
              >
                Disconnect
              </button>
            ) : (
              <button id="connectBtn" onClick={connectWallet}>
                {loading ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>

        {/* LOADING INDICATOR */}
        {loading && (
          <div style={{
            background: "rgba(12,19,30,0.85)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "15px 20px",
            marginBottom: "20px",
            color: "var(--blue-bright)",
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: "13px"
          }}>
            [Blockchain Syncing] Processing smart contract request. Please confirm wallet transaction...
          </div>
        )}

        {/* 1. DASHBOARD VIEW */}
        <div className={`view ${activeView === "dashboard" ? "active" : ""}`}>
          {pendingQualifications.length > 0 && (
            <div className="card" style={{
              background: "rgba(94, 200, 242, 0.06)",
              border: "2px dashed var(--blue-bright)",
              borderRadius: "12px",
              padding: "20px",
              marginBottom: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "15px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ background: "rgba(94, 200, 242, 0.2)", borderRadius: "50%", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" strokeWidth="2.5" strokeLinecap="round" style={{ width: "22px", height: "22px" }}>
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4"/>
                    <path d="M12 16h.01"/>
                  </svg>
                </div>
                <div>
                  <h4 style={{ margin: 0, color: "#fff", fontSize: "15px", fontWeight: "600" }}>Performance Bonus Claims Available!</h4>
                  <p style={{ margin: "2px 0 0 0", color: "var(--text-muted)", fontSize: "12px" }}>
                    You qualified for the Performance Bonus! Choose your payout option below. The claim window is open for 24 hours only.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {pendingQualifications.map((qual) => {
                  const claimDateStr = new Date(qual.claimTime * 1000).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  return (
                    <div key={qual.tierIndex} style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "15px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>Tier {qual.tierIndex + 1} Bonus</span>
                          <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--text-muted)" }}>Target: {qual.target} USDT</span>
                        </div>
                        <div className="mono" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                          Claim Date: {claimDateStr}
                        </div>
                      </div>

                      {qual.isClaimWindowActive ? (
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleClaimPerformance(qual.tierIndex, true)}
                            className="btn primary-btn"
                            disabled={loading}
                            style={{
                              padding: "8px 16px",
                              fontSize: "12px",
                              flex: 1,
                              minWidth: "140px",
                              background: "linear-gradient(135deg, var(--blue-bright) 0%, #1e40af 100%)",
                              cursor: "pointer"
                            }}
                          >
                            Option 1: Instant Payout ({qual.instant} USDT)
                          </button>
                          <button
                            onClick={() => handleClaimPerformance(qual.tierIndex, false)}
                            className="btn secondary-btn"
                            disabled={loading}
                            style={{
                              padding: "8px 16px",
                              fontSize: "12px",
                              flex: 1,
                              minWidth: "140px",
                              border: "1px solid var(--border)",
                              cursor: "pointer"
                            }}
                          >
                            Option 2: Daily Stream ({qual.daily} USDT/day for 30d)
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: "12px", color: "var(--orange)", display: "flex", alignItems: "center", gap: "5px" }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "16px", height: "16px" }}>
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                          Claim window will activate on {claimDateStr} for 24 hours only.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="stat-row">
            <div className="card hero-card">
              <div>
                <div className="k">Total Earned</div>
                <div className="big mono">
                  {totalEarnedAcrossStreams} <span style={{ fontSize: "16px", color: "var(--text-muted)" }}>USDT</span>
                </div>
                <div className="sub">Across all income streams · live updates</div>
              </div>
            </div>
            
            <div className="card mini-card">
              <div className="k">Total Deposit</div>
              <div className="big mono">{userData.totalDeposits}</div>
              <div className="sub">
                {isRegistered ? "1 active package" : "No active packages"}
              </div>
            </div>

            <div className="card mini-card">
              <div className="k">Available Balance</div>
              <div className="big mono" style={{ color: "var(--up)" }}>{totalAvailableBalance}</div>
              <div className="sub">Unclaimed and ready to withdraw</div>
            </div>
          </div>

          <div className="stat-row" style={{ gridTemplateColumns: "1fr" }}>
            <div className="card mini-card">
              <div className="k">Total Withdraw Balance</div>
              <div className="big mono" style={{ color: "var(--up)" }}>
                {userData.totalWithdrawn} <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
              </div>
              <div className="sub">Lifetime payouts withdrawn to your wallet</div>
            </div>
          </div>

          <div className="section-title">Income Capping Limits</div>
          <div className="capping-grid">
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontWeight: "600", fontSize: "14px" }}>ROI Limit Cap (220% Max)</span>
                <span className="mono" style={{ fontSize: "14px", color: "var(--blue-bright)" }}>
                  {currentRoiEarned.toFixed(2)} / {maxRoiCap.toFixed(2)} USDT
                </span>
              </div>
              <div className="progress-bg" style={{ background: "var(--surface-2)", height: "10px", borderRadius: "5px", overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
                <div className="progress-fill roi-fill" style={{ width: `${roiCapPercent}%`, height: "100%", transition: "width 0.3s ease" }}></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                <span>Includes all Yields, Commissions & Bonuses (Solidity cap)</span>
                <span>{roiCapPercent.toFixed(1)}% Reached</span>
              </div>
            </div>

            <div className="card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontWeight: "600", fontSize: "14px" }}>Network Limit Cap (400% Max)</span>
                <span className="mono" style={{ fontSize: "14px", color: "var(--blue-bright)" }}>
                  {currentNetworkEarned.toFixed(2)} / {maxNetworkCap.toFixed(2)} USDT
                </span>
              </div>
              <div className="progress-bg" style={{ background: "var(--surface-2)", height: "10px", borderRadius: "5px", overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
                <div className="progress-fill network-fill" style={{ width: `${networkCapPercent}%`, height: "100%", transition: "width 0.3s ease" }}></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                <span>Includes all ROI, Booster & Network Income</span>
                <span>{networkCapPercent.toFixed(1)}% Reached</span>
              </div>
            </div>
          </div>

          <div className="section-title">Income Streams</div>
          <div className="income-grid">
            <div className="income-card">
              <div className="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 18l5-6 4 4 7-9"/>
                </svg>
              </div>
              <div className="name">Daily ROI</div>
              <div className="amt mono">
                {(parseFloat(displayDailyROI) + parseFloat(displayBoosterROI)).toFixed(2)}
              </div>
              <div className="rate">Active Rate: {userData.boosterRate}</div>
            </div>

            <div className="income-card">
              <div className="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="5" r="2"/>
                  <circle cx="5" cy="19" r="2"/>
                  <circle cx="19" cy="19" r="2"/>
                  <path d="M12 7v5M12 12L6 17M12 12l6 5"/>
                </svg>
              </div>
              <div className="name">Level Income</div>
              <div className="amt mono">{displayLevelIncome}</div>
              <div className="rate">5 levels deep</div>
            </div>

            <div className="income-card">
              <div className="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4v16h16M8 15l3-3 3 2 5-6"/>
                </svg>
              </div>
              <div className="name">Level ROI</div>
              <div className="amt mono">{displayLevelROI}</div>
              <div className="rate">Team matching ROI</div>
            </div>

            <div className="income-card">
              <div className="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7z"/>
                </svg>
              </div>
              <div className="name">Performance Bonus</div>
              <div className="amt mono">
                {displayPerformanceBonus}
              </div>
              <div className="rate">Leg volume match</div>
            </div>
          </div>

          <div className="two-col">
            <div className="card team-card">
              <div className="section-title" style={{ marginTop: 0 }}>My Network Statistics</div>
              <div className="team-stats">
                <div className="team-stat">
                  <div className="k">Direct referrals</div>
                  <div className="v">{userData.directCount}</div>
                </div>
                <div className="team-stat">
                  <div className="k">Qualified Directs (≥50 USDT)</div>
                  <div className="v">{userData.qualifiedDirectsCount}</div>
                </div>
                <div className="team-stat">
                  <div className="k">Total team count</div>
                  <div className="v">{userData.totalTeamCount}</div>
                </div>
                <div className="team-stat">
                  <div className="k">Strongest Leg Vol</div>
                  <div className="v">{userData.strongestLegVolume}</div>
                </div>
                <div className="team-stat">
                  <div className="k">Total team volume</div>
                  <div className="v">{userData.totalTeamVolume}</div>
                </div>
              </div>
              <div className="ref-link">
                <span className="addr">
                  {walletConnected 
                    ? `${origin}/?ref=${walletAddress}`
                    : "Connect wallet to see referral link"}
                </span>
                {walletConnected && (
                  <button className="copy-btn" onClick={copyReferralLink}>
                    {copyText}
                  </button>
                )}
              </div>
            </div>

            <div className="card" style={{ maxHeight: "315px", overflowY: "auto" }}>
              <div className="section-title" style={{ marginTop: 0 }}>Recent Transactions</div>
              {txs.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "10px 0" }}>
                  {walletConnected 
                    ? "No recent transaction history found in the last 5000 blocks." 
                    : "Please connect wallet to view your on-chain transaction history."}
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Detail</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx, idx) => (
                      <tr key={idx}>
                        <td><span className={tx.tagClass}>{tx.typeName}</span></td>
                        <td>{tx.detail}</td>
                        <td style={{ textAlign: "right" }} className="amt-pos">{tx.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* 2. MY NETWORK VIEW */}
        <div className={`view ${activeView === "network" ? "active" : ""}`}>
          <div className="card team-card" style={{ marginBottom: "20px" }}>
            <div className="section-title" style={{ marginTop: 0 }}>Referral Network Status</div>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6" }}>
              Earn Level Income up to 10 generations, and Level ROI up to 20 generations. Level ROI unlocks sequentially based on qualified direct referrals with at least 50 USDT deposit (Level L requires L qualified directs).
            </p>
            <div className="team-stats" style={{ marginTop: "20px" }}>
              <div className="team-stat">
                <div className="k">Direct Referrals</div>
                <div className="v">{userData.directCount}</div>
              </div>
              <div className="team-stat">
                <div className="k">Qualified Directs (≥50 USDT)</div>
                <div className="v">{userData.qualifiedDirectsCount}</div>
              </div>
              <div className="team-stat">
                <div className="k">Total Downline Count</div>
                <div className="v">{userData.totalTeamCount}</div>
              </div>
              <div className="team-stat">
                <div className="k">Strongest Leg Volume</div>
                <div className="v">{userData.strongestLegVolume} USDT</div>
              </div>
              <div className="team-stat">
                <div className="k">Other Legs Volume</div>
                <div className="v">{(parseFloat(userData.totalTeamVolume) - parseFloat(userData.strongestLegVolume)).toFixed(2)} USDT</div>
              </div>
            </div>
          </div>

          <div className="network-grid">
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="section-title" style={{ marginTop: 0 }}>Interactive Network Tree</div>
              <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "20px" }}>
                Explore your hierarchical MLM tree. Click any node to load and expand its direct referrals. Click the crown icon to inspect the root.
              </p>
              
              <div className="tree-canvas-container">
                {treeRoot ? (
                  <div className="tree-inner-container">
                    <TreeNodeComponent addr={treeRoot} depth={0} />
                  </div>
                ) : (
                  <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading tree...</div>
                )}
              </div>
            </div>
            
            <div className="card">
              <div className="section-title" style={{ marginTop: 0 }}>Node Details Inspector</div>
              {selectedNode && treeNodes[selectedNode.toLowerCase()] ? (
                (() => {
                  const inspected = treeNodes[selectedNode.toLowerCase()];
                  const strongVol = parseFloat(inspected.strongestLegVolume);
                  const totalVol = parseFloat(inspected.totalTeamVolume);
                  const otherVol = totalVol - strongVol;
                  
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                      <div className="team-stat" style={{ paddingBottom: "10px", borderBottom: "1px solid var(--border)" }}>
                        <div className="k" style={{ fontSize: "11px" }}>Inspected Node</div>
                        <div className="v mono" style={{ fontSize: "11.5px", wordBreak: "break-all", color: "var(--blue-bright)" }}>
                          {inspected.address}
                        </div>
                      </div>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Deposits</div>
                          <div className="v mono" style={{ fontSize: "14px" }}>{parseFloat(inspected.totalDeposits).toFixed(0)} USDT</div>
                        </div>
                        <div>
                          <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Directs</div>
                          <div className="v" style={{ fontSize: "14px" }}>{inspected.directCount} ({inspected.qualifiedDirectsCount} active)</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Team Count</div>
                          <div className="v" style={{ fontSize: "14px" }}>{inspected.totalTeamCount} members</div>
                        </div>
                        <div>
                          <div className="k" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Team Volume</div>
                          <div className="v mono" style={{ fontSize: "14px" }}>{parseFloat(inspected.totalTeamVolume).toFixed(0)} USDT</div>
                        </div>
                      </div>

                      <div style={{ padding: "10px", background: "var(--surface-2)", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ color: "var(--text-muted)" }}>Sponsor:</span>
                          <span className="mono" style={{ float: "right" }}>{inspected.sponsor !== ethers.ZeroAddress ? shorten(inspected.sponsor) : "None (Root)"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ color: "var(--text-muted)" }}>Strong Leg:</span>
                          <span className="mono" style={{ float: "right" }}>{strongVol.toFixed(0)} USDT</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--text-muted)" }}>Other Legs:</span>
                          <span className="mono" style={{ float: "right" }}>{otherVol.toFixed(0)} USDT</span>
                        </div>
                      </div>

                      {inspected.children.length > 0 && (
                        <div style={{ fontSize: "12px" }}>
                          <div style={{ fontWeight: "600", color: "var(--text-muted)", marginBottom: "6px" }}>Direct Downlines ({inspected.children.length}):</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "100px", overflowY: "auto", paddingRight: "5px" }}>
                            {inspected.children.map((c, i) => (
                              <div key={i} className="mono" style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                                · {c}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "10px 0" }}>
                  Click on any node in the tree diagram to inspect its MLM stats and display downlines.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. INCOME HISTORY VIEW */}
        <div className={`view ${activeView === "history" ? "active" : ""}`}>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px", marginBottom: "24px" }}>
              <div>
                <h3 className="section-title" style={{ marginTop: 0, marginBottom: "4px" }}>Income Audits & Earnings Log</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0 }}>
                  Detailed historical ledger of all yields, bonuses, deposits, and withdrawals.
                </p>
              </div>

              {/* Total Income of Selected */}
              <div style={{
                background: "rgba(94, 200, 242, 0.05)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "12px 18px",
                textAlign: "right",
                minWidth: "180px"
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Total Income</div>
                <div className="mono" style={{ fontSize: "20px", fontWeight: "700", color: "var(--blue-bright)", marginTop: "4px" }}>
                  {totalSelectedIncome.toFixed(2)} <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>USDT</span>
                </div>
              </div>
            </div>

            {/* Filter controls */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginBottom: "20px",
              background: "var(--surface-2)",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid var(--border)"
            }}>
              {/* Type Filter */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>Type of Income</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "#fff",
                    padding: "8px 12px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="deposit">Deposit</option>
                  <option value="withdraw">Withdrawal</option>
                  <option value="roi">Daily ROI Payout</option>
                  <option value="level_income">Level Income</option>
                  <option value="level_roi">Level ROI Matching</option>
                  <option value="performance">Performance Bonus</option>
                </select>
              </div>

              {/* Level Dropdown */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>Level (Dropdown)</label>
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "#fff",
                    padding: "8px 12px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                >
                  <option value="all">All Levels</option>
                  {Array.from({ length: 20 }, (_, idx) => (
                    <option key={idx + 1} value={(idx + 1).toString()}>Level {idx + 1}</option>
                  ))}
                </select>
              </div>

              {/* Level Search */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>Search by Level</label>
                <input
                  type="text"
                  placeholder="e.g. 5"
                  value={searchLevel}
                  onChange={(e) => setSearchLevel(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "#fff",
                    padding: "8px 12px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              {/* Start Date */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>Start Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "#fff",
                    padding: "8px 12px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              {/* End Date */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>End Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "#fff",
                    padding: "8px 12px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Address Search */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>Search by Address (From User)</label>
              <input
                type="text"
                placeholder="Search wallet address..."
                value={searchFromUser}
                onChange={(e) => setSearchFromUser(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "#fff",
                  padding: "10px 14px",
                  fontSize: "13px",
                  outline: "none"
                }}
              />
            </div>

            {/* Reset Button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
              <button
                onClick={() => {
                  setFilterType("all");
                  setFilterLevel("all");
                  setSearchLevel("");
                  setFilterStartDate("");
                  setFilterEndDate("");
                  setSearchFromUser("");
                }}
                className="btn secondary-btn"
                style={{ padding: "6px 12px", fontSize: "12px", border: "1px solid var(--border)", cursor: "pointer" }}
              >
                Reset Filters
              </button>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              {filteredTxs.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "30px 0", textAlign: "center" }}>
                  No matching transaction logs found for the selected filters.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "13px" }}>S.No.</th>
                      <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "13px" }}>Type</th>
                      <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "13px" }}>From User</th>
                      <th style={{ textAlign: "right", padding: "12px 10px", fontSize: "13px" }}>Amount</th>
                      <th style={{ textAlign: "center", padding: "12px 10px", fontSize: "13px" }}>Level</th>
                      <th style={{ textAlign: "left", padding: "12px 10px", fontSize: "13px" }}>Date and Time</th>
                      <th style={{ textAlign: "center", padding: "12px 10px", fontSize: "13px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTxs.map((tx, idx) => {
                      const dateStr = new Date(tx.timestamp * 1000).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      const isNegative = tx.type === "withdraw";
                      
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                          <td style={{ padding: "12px 10px", fontSize: "13px" }}>
                            <span className={
                              tx.type === "deposit" ? "tag roi" :
                              tx.type === "withdraw" ? "tag bonus" :
                              tx.type === "level_income" ? "tag level" :
                              tx.type === "level_roi" ? "tag level" :
                              tx.type === "roi" ? "tag roi" :
                              "tag bonus"
                            }>
                              {tx.typeName}
                            </span>
                          </td>
                          <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">
                            {tx.fromUser.length > 10 ? (
                              <span title={tx.fromUser} style={{ cursor: "pointer", borderBottom: "1px dashed var(--text-muted)" }} onClick={() => {
                                navigator.clipboard.writeText(tx.fromUser);
                                alert("Address copied!");
                              }}>
                                {shorten(tx.fromUser)}
                              </span>
                            ) : tx.fromUser}
                          </td>
                          <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "right", fontWeight: "600" }} className={isNegative ? "amt-neg" : "amt-pos"}>
                            {isNegative ? "-" : "+"}{tx.amount.toFixed(2)} USDT
                          </td>
                          <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "center" }} className="mono">{tx.level}</td>
                          <td style={{ padding: "12px 10px", fontSize: "13px" }} className="mono">{dateStr}</td>
                          <td style={{ padding: "12px 10px", fontSize: "13px", textAlign: "center" }}>
                            <span style={{
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#10b981",
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: "600"
                            }}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            {/* Pagination Controls */}
            {filteredTxs.length > 0 && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "20px",
                flexWrap: "wrap",
                gap: "15px",
                paddingTop: "15px",
                borderTop: "1px solid var(--border)"
              }}>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Showing {Math.min(filteredTxs.length, (currentPage - 1) * itemsPerPage + 1)}–{Math.min(filteredTxs.length, currentPage * itemsPerPage)} of {filteredTxs.length} entries
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="btn secondary-btn"
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      border: "1px solid var(--border)",
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                      opacity: currentPage === 1 ? 0.5 : 1,
                      transition: "all 0.2s"
                    }}
                  >
                    Previous
                  </button>
                  
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = 1;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else {
                      if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "6px",
                          border: pageNum === currentPage ? "1px solid var(--blue-bright)" : "1px solid var(--border)",
                          background: pageNum === currentPage ? "rgba(94, 200, 242, 0.1)" : "transparent",
                          color: pageNum === currentPage ? "var(--blue-bright)" : "#fff",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: pageNum === currentPage ? "600" : "normal",
                          transition: "all 0.2s"
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="btn secondary-btn"
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      border: "1px solid var(--border)",
                      cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      transition: "all 0.2s"
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. NEW DEPOSIT VIEW */}
        <div className={`view ${activeView === "deposit" ? "active" : ""}`}>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Deposit USDT Package</div>
            
            {!isRegistered && (
              <div style={{ 
                background: "rgba(94, 200, 242, 0.08)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "15px",
                fontSize: "13px",
                marginBottom: "20px",
                lineHeight: "1.6"
              }}>
                <span style={{ color: "var(--blue-bright)", fontWeight: "600" }}>Account Registration Required:</span> You are registering for the first time. You must enter a valid sponsor wallet address below to join.
              </div>
            )}

            <div className="withdraw-card">
              <form onSubmit={handleDeposit}>
                {!isRegistered && (
                  <div className="field">
                    <label>Sponsor / Upline Wallet Address</label>
                    <input 
                      type="text" 
                      placeholder="0x..." 
                      value={sponsorAddress}
                      onChange={(e) => setSponsorAddress(e.target.value)}
                      required
                    />
                  </div>
                )}
                
                <div className="field">
                  <label>Amount (USDT)</label>
                  <input 
                    type="number" 
                    placeholder="Min 10 USDT" 
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min="10"
                    required
                  />
                </div>

                <button type="submit" className="withdraw-btn" disabled={!walletConnected || loading}>
                  {loading ? "Syncing..." : isRegistered ? "Increase Package / Deposit" : "Register & Deposit"}
                </button>
              </form>

              <div className="avail-box">
                <div className="k">USDT Balance in Wallet</div>
                <div className="v mono">{walletUSDTBalance} USDT</div>
                
                <div className="note" style={{ marginTop: "15px" }}>
                  Minimum deposit is 10 USDT. A package activation requires a one-time USDT approval signature.
                  {isRegistered && (
                    <div style={{ marginTop: "8px", color: "var(--blue-bright)" }}>
                      Your current active package is <strong>{userData.totalDeposits} USDT</strong>. To upgrade/top-up, the new deposit amount must be greater than or equal to your last deposit amount of <strong>{lastDepositAmount} USDT</strong>.
                    </div>
                  )}
                </div>

                {/* Developer Token Mint helper */}
                <button 
                  onClick={handleMintUSDT} 
                  className="copy-btn" 
                  style={{ width: "100%", padding: "10px", marginTop: "20px" }}
                  disabled={!walletConnected || loading}
                >
                  Mint 500 Test USDT (Developer Helper)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5. WITHDRAW VIEW */}
        <div className={`view ${activeView === "withdraw" ? "active" : ""}`}>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Claim Accrued Balances</div>
            <div className="withdraw-card">
              <form onSubmit={handleWithdraw}>
                <div className="field">
                  <label>Amount (USDT)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Receiving Wallet Address (Auto-sets to yours)</label>
                  <input 
                    type="text" 
                    value={withdrawAddressInput} 
                    onChange={(e) => setWithdrawAddressInput(e.target.value)}
                    disabled
                  />
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                    Security Rule: Earnings are always paid back to the connected wallet.
                  </span>
                </div>
                <button type="submit" className="withdraw-btn" disabled={!walletConnected || loading}>
                  Request Withdrawal
                </button>
              </form>

              <div className="avail-box">
                <div className="k">Available to Withdraw</div>
                <div className="v mono">{totalAvailableBalance} USDT</div>
                <div className="note">
                  Withdrawals trigger a real-time smart contract payout.
                </div>
                
                <button 
                  onClick={handleClaimAll} 
                  className="withdraw-btn" 
                  style={{ background: "transparent", color: "var(--blue-bright)", border: "1px solid var(--border)", marginTop: "15px" }}
                  disabled={!walletConnected || loading}
                >
                  Claim Full Balance (Claim All)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 6. PROFILE & SETTINGS VIEW */}
        <div className={`view ${activeView === "profile" ? "active" : ""}`}>
          <div className="card" style={{ marginBottom: "20px" }}>
            <div className="section-title" style={{ marginTop: 0 }}>Account Profile</div>
            <div className="team-stats">
              <div className="team-stat">
                <div className="k">Your Registered Sponsor</div>
                <div className="v mono" style={{ fontSize: "12px" }}>{userData.sponsor}</div>
              </div>
              <div className="team-stat">
                <div className="k">Registration Date</div>
                <div className="v" style={{ fontSize: "14px" }}>
                  {userData.registrationTime > 0 
                    ? new Date(userData.registrationTime * 1000).toLocaleString() 
                    : "Not Registered"}
                </div>
              </div>
              <div className="team-stat">
                <div className="k">Active Daily ROI Rate</div>
                <div className="v">{userData.boosterRate}</div>
              </div>
              <div className="team-stat">
                <div className="k">Registered referrals</div>
                <div className="v">{userData.directCount} members</div>
              </div>
            </div>
          </div>


          <div className="card" style={{ marginBottom: "20px" }}>
            <div className="section-title" style={{ marginTop: 0 }}>Performance Bonus Tiers</div>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", marginBottom: "15px" }}>
              Qualify for Performance Bonus: Make your Strongest Leg volume greater than or equal to Target, and all other legs combined volume greater than or equal to Target. Performance payouts are separate from Daily ROI caps.
            </p>
            <table style={{ fontSize: "12px" }}>
              <thead>
                <tr>
                  <th>Target Vol</th>
                  <th>Instant Payout</th>
                  <th>30-Day Daily Payout</th>
                  <th>Your Leg Progress (Strong / Others)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {PERFORMANCE_TIERS.map((tier, idx) => {
                  const strongVol = parseFloat(userData.strongestLegVolume);
                  const totalVol = parseFloat(userData.totalTeamVolume);
                  const otherVol = totalVol - strongVol;
                  const achieved = isRegistered && strongVol >= tier.target && otherVol >= tier.target;

                  return (
                    <tr key={idx}>
                      <td className="mono">{tier.target.toLocaleString()} USDT</td>
                      <td className="mono" style={{ color: "var(--up)" }}>+{tier.instant} USDT</td>
                      <td className="mono">+{tier.daily} USDT/day</td>
                      <td className="mono" style={{ color: "var(--text-muted)" }}>
                        {strongVol.toFixed(0)} / {tier.target} | {otherVol.toFixed(0)} / {tier.target}
                      </td>
                      <td>
                        <span 
                          className="tag" 
                          style={{ 
                            background: achieved ? "rgba(95,227,168,0.12)" : "rgba(242,112,94,0.12)",
                            color: achieved ? "var(--up)" : "var(--down)"
                          }}
                        >
                          {achieved ? "Qualified" : "Locked"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>


        </div>
      </main>
    </div>
  );
}
