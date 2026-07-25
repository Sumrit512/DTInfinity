"use client";

import { useState, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api.js";

// Constants & ABIs
import {
  DEFAULT_DT_INFINITY_ADDRESS,
  DEFAULT_USDT_ADDRESS,
  USDT_ABI,
  DT_INFINITY_ABI,
  PERFORMANCE_TIERS
} from "../constants/abis.js";

// Utilities & Math
import {
  formatUSDT,
  safeFloat,
  shorten
} from "../utils/formatters.js";
import {
  generateEventsList
} from "../utils/simulation.js";

// Modular UI Components
import Navbar from "../components/layout/Navbar.js";
import Sidebar from "../components/layout/Sidebar.js";
import DashboardView from "../components/views/DashboardView.js";
import DepositView from "../components/views/DepositView.js";
import WithdrawView from "../components/views/WithdrawView.js";
import NetworkView from "../components/views/NetworkView.js";
import ReportsView from "../components/views/ReportsView.js";
import SettingsModal from "../components/modals/SettingsModal.js";
import MissedTxModal from "../components/modals/MissedTxModal.js";

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

  const [showSettings, setShowSettings] = useState(false);
  const [showMissedTxModal, setShowMissedTxModal] = useState(false);

  const [reportCategory, setReportCategory] = useState("all");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportSearchAddr, setReportSearchAddr] = useState("");

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const [treeRoot, setTreeRoot] = useState("");
  const [localTreeNodes, setLocalTreeNodes] = useState(() => {
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
    setLocalTreeNodes(prev => {
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
  const [latestTxDetails, setLatestTxDetails] = useState(null);
  const [missedTxHash, setMissedTxHash] = useState("");
  const [syncingMissed, setSyncingMissed] = useState(false);

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
  const [sortOrder, setSortOrder] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Real-time ticking simulation states
  const [oneDay, setOneDay] = useState(1800n);
  const [perfOneDay, setPerfOneDay] = useState(480n);
  const [secondsSinceSync, setSecondsSinceSync] = useState(0);

  // Mobile responsiveness sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Convex mutations and queries
  const upsertUserMutation = useMutation(api.users.upsertUser);
  const syncDepositsMutation = useMutation(api.transactions.syncDeposits);
  const syncWithdrawalsMutation = useMutation(api.transactions.syncWithdrawals);
  const syncOnChainEventsMutation = useMutation(api.events.syncOnChainEvents);
  const syncMissedTxAction = useAction(api.transactions.syncMissedTx);

  const targetAddressForLedger = (searchFromUser && searchFromUser.trim().length >= 10)
    ? searchFromUser.trim().toLowerCase()
    : walletAddress;

  const dbLedger = useQuery(api.events.getLedger, targetAddressForLedger ? {
    contractAddress: dtInfinityAddress,
    address: targetAddressForLedger,
    currentOneDayVal: Number(oneDay || 86400n),
    currentPerfOneDayVal: Number(perfOneDay || 86400n),
    levelIncomeEarned: parseFloat(userData.levelIncomeEarned || "0"),
    levelROIEarned: parseFloat(userData.levelROIEarned || "0"),
    performanceBonusEarned: parseFloat(userData.performanceBonusEarned || "0"),
    totalWithdrawn: parseFloat(userData.totalWithdrawn || "0"),
    activeBonuses: activeBonuses.map(b => ({
      tierIndex: b.tierIndex,
      dailyRate: b.dailyRate,
      startTime: b.startTime,
      endTime: b.endTime,
      lastClaimTime: b.lastClaimTime,
    })),
  } : "skip");

  const dbTreeNodes = useQuery(api.users.getDownlineTree, walletAddress ? {
    contractAddress: dtInfinityAddress,
    address: walletAddress
  } : "skip");

  const treeNodes = useMemo(() => {
    return { ...localTreeNodes, ...dbTreeNodes };
  }, [localTreeNodes, dbTreeNodes]);

  async function syncToConvex(
    addr,
    basicInfo,
    networkInfo,
    boosterRate,
    directs,
    deposits,
    withdrawals,
    events,
    sessionTxDetails,
    incomeInfo,
    activeBonuses
  ) {
    if (!addr) return;
    try {
      await upsertUserMutation({
        contractAddress: dtInfinityAddress,
        address: addr,
        sponsor: basicInfo.sponsor,
        totalDeposits: parseFloat(ethers.formatUnits(basicInfo.totalDeposits || 0n, 18)),
        registrationTime: Number(basicInfo.registrationTime || 0n),
        lastUpdateROI: Number(basicInfo.lastUpdateROI || 0n),
        claimableBalance: parseFloat(ethers.formatUnits(basicInfo.claimableBalance || 0n, 18)),
        totalWithdrawn: parseFloat(ethers.formatUnits(basicInfo.totalWithdrawn || 0n, 18)),
        directCount: Number(networkInfo.directCount || 0n),
        qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount || 0n),
        totalTeamCount: Number(networkInfo.totalTeamCount || 0n),
        totalTeamVolume: parseFloat(ethers.formatUnits(networkInfo.totalTeamVolume || 0n, 18)),
        strongestLegAddress: networkInfo.strongestLegAddress,
        strongestLegVolume: parseFloat(ethers.formatUnits(networkInfo.strongestLegVolume || 0n, 18)),
        boosterRate: Number(boosterRate || 0n) / 100,
        dailyROIEarned: incomeInfo ? parseFloat(ethers.formatUnits(incomeInfo.dailyROIEarned || 0n, 18)) : 0,
        roiBoosterEarned: incomeInfo ? parseFloat(ethers.formatUnits(incomeInfo.roiBoosterEarned || 0n, 18)) : 0,
        levelIncomeEarned: incomeInfo ? parseFloat(ethers.formatUnits(incomeInfo.levelIncomeEarned || 0n, 18)) : 0,
        levelROIEarned: incomeInfo ? parseFloat(ethers.formatUnits(incomeInfo.levelROIEarned || 0n, 18)) : 0,
        activeBonuses: (activeBonuses || []).map(b => ({
          tierIndex: Number(b.tierIndex || 0),
          dailyRate: Number(b.dailyRate || 0),
          startTime: Number(b.startTime || 0),
          endTime: Number(b.endTime || 0),
          lastClaimTime: Number(b.lastClaimTime || b.startTime || 0)
        })),
      });

      if (deposits && deposits.length > 0) {
        await syncDepositsMutation({
          contractAddress: dtInfinityAddress,
          user: addr,
          deposits: deposits.map((d, idx) => {
            const activeTx = sessionTxDetails || latestTxDetails;
            const actualTxHash = (activeTx?.type === "deposit" && idx === deposits.length - 1)
              ? activeTx.hash
              : undefined;
            const numAmount = typeof d.amount === "number" ? d.amount : parseFloat(ethers.formatUnits(d.amount || 0n, 18));
            const numTime = Number(d.time || d.timestamp || 0);
            return {
              amount: numAmount,
              time: numTime,
              txHash: `0x_dep_${addr.toLowerCase()}_${idx}_${numTime}`,
              actualTxHash,
            };
          }),
        });
      }

      if (withdrawals && withdrawals.length > 0) {
        await syncWithdrawalsMutation({
          contractAddress: dtInfinityAddress,
          user: addr,
          withdrawals: withdrawals.map((w, idx) => {
            const activeTx = sessionTxDetails || latestTxDetails;
            const actualTxHash = (activeTx?.type === "withdraw" && idx === withdrawals.length - 1)
              ? activeTx.hash
              : undefined;
            const numAmount = typeof w.amount === "number" ? w.amount : parseFloat(ethers.formatUnits(w.amount || 0n, 18));
            const numTime = Number(w.time || w.timestamp || 0);
            return {
              amount: numAmount,
              time: numTime,
              txHash: `0x_with_${addr.toLowerCase()}_${idx}_${numTime}`,
              actualTxHash,
            };
          }),
        });
      }

      const realEventsOnly = (events || []).filter(e => !e.isSimulated);
      await syncOnChainEventsMutation({
        contractAddress: dtInfinityAddress,
        user: addr,
        events: realEventsOnly.map((e, idx) => ({
          type: e.type,
          typeName: e.typeName,
          fromUser: e.fromUser,
          amount: e.amount,
          level: e.level.toString(),
          timestamp: e.timestamp,
          status: e.status,
          txHash: e.txHash || `0x_evt_${addr.toLowerCase()}_${idx}`,
          blockNumber: e.blockNumber || 0,
          isSimulated: false,
          tierIndex: e.tierIndex,
          logIndex: e.logIndex,
        })),
      });
    } catch (err) {
      console.error("Convex synchronization failed", err);
    }
  }

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      let savedDT = localStorage.getItem("DT_INFINITY_ADDRESS");
      if (savedDT && (
        savedDT.toLowerCase() === "0x229e2e8ef23c4e0c558c9473baaee3ff330c50b1".toLowerCase() ||
        savedDT.toLowerCase() === "0x858b5e656355401bb099c5120715d25761a8d1c2".toLowerCase() ||
        savedDT.toLowerCase() === "0x98D4730F214f6386a0C12626f4C87Fb4114B8ECD".toLowerCase() ||
        savedDT.toLowerCase() === "0x03b628429b45A78ad47a922Ca6Fc7ce5515a69A1".toLowerCase() ||
        savedDT.toLowerCase() === "0x360D67b9F9EAa887754200EEa4c8E8E368784f51".toLowerCase()
      )) {
        localStorage.removeItem("DT_INFINITY_ADDRESS");
        localStorage.removeItem("USDT_ADDRESS");
        savedDT = null;
      }
      const savedUSDT = localStorage.getItem("USDT_ADDRESS");
      const savedChain = localStorage.getItem("TARGET_CHAIN_ID");
      const savedBlock = localStorage.getItem("DT_INFINITY_DEPLOYMENT_BLOCK");
      if (savedDT) setDtInfinityAddress(savedDT);
      if (savedUSDT) setUsdtAddress(savedUSDT);
      if (savedChain) setTargetChainId(BigInt(savedChain));
      if (savedBlock) setDeploymentBlock(savedBlock);

      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && ethers.isAddress(ref)) {
        setSponsorAddress(ref);
        setActiveView("deposit");
      }
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterLevel, filterStartDate, filterEndDate, searchFromUser, searchLevel]);

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

  const handleResetCache = () => {
    if (walletAddress) {
      const cacheKey = `TX_CACHE_${walletAddress.toLowerCase()}`;
      localStorage.removeItem(cacheKey);
      alert("Transaction history cache cleared!");
      loadBlockchainData(walletAddress);
    } else {
      alert("Please connect wallet first.");
    }
  };

  function disconnectWallet() {
    setWalletConnected(false);
    setWalletAddress("");
    setIsRegistered(false);
  }

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
          setWithdrawAddressInput(addr);

          const network = await provider.getNetwork();
          const chainId = network.chainId;
          if (chainId !== targetChainId) {
            setIsWrongNetwork(true);
            setNetworkName(`Chain ID: ${chainId}`);
          } else {
            setIsWrongNetwork(false);
            setNetworkName(chainId === 97n ? "BEP-20 · BSC Testnet" : "BEP-20 · BSC Mainnet");
            await loadBlockchainData(addr);
          }
        }
      } catch (err) {
        console.error("Wallet connection failed", err);
      } finally {
        setLoading(false);
      }
    } else {
      alert("No Web3 wallet provider found. Please install MetaMask or Trust Wallet.");
    }
  }

  async function switchNetwork() {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        setLoading(true);
        const targetHex = "0x" + targetChainId.toString(16);
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetHex }]
          });
          setIsWrongNetwork(false);
          if (walletAddress) {
            await loadBlockchainData(walletAddress);
          }
        } catch (switchError) {
          if (switchError.code === 4902) {
            if (targetChainId === 97n) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: "0x61",
                    chainName: "BNB Smart Chain Testnet",
                    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
                    rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
                    blockExplorerUrls: ["https://testnet.bscscan.com"]
                  }
                ]
              });
            }
            setIsWrongNetwork(false);
            if (walletAddress) {
              await loadBlockchainData(walletAddress);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    }
  }

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

      try {
        await upsertUserMutation({
          contractAddress: dtInfinityAddress,
          address: addr,
          sponsor: basicInfo.sponsor,
          totalDeposits: parseFloat(ethers.formatUnits(basicInfo.totalDeposits || 0n, 18)),
          registrationTime: Number(basicInfo.registrationTime || 0n),
          lastUpdateROI: Number(basicInfo.lastUpdateROI || 0n),
          claimableBalance: parseFloat(ethers.formatUnits(basicInfo.claimableBalance || 0n, 18)),
          totalWithdrawn: parseFloat(ethers.formatUnits(basicInfo.totalWithdrawn || 0n, 18)),
          directCount: Number(networkInfo.directCount || 0n),
          qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount || 0n),
          totalTeamCount: Number(networkInfo.totalTeamCount || 0n),
          totalTeamVolume: parseFloat(ethers.formatUnits(networkInfo.totalTeamVolume || 0n, 18)),
          strongestLegAddress: networkInfo.strongestLegAddress,
          strongestLegVolume: parseFloat(ethers.formatUnits(networkInfo.strongestLegVolume || 0n, 18)),
          boosterRate: Number(boosterRate || 0n) / 100,
        });
      } catch (err) {
        console.warn("Failed to sync node to Convex in loadTreeNode:", addr, err);
      }

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

  // Lightweight periodic re-check of performance tier pending state (every 10s).
  // This ensures the claim window timer appears without needing a full page reload.
  // Uses a small interval to catch the 120-second claim window in test mode.
  async function refreshPendingQualifications(addr) {
    if (!addr || !window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const dtContract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, provider);
      let currentPerfOneDayVal = 120n;
      try { currentPerfOneDayVal = await dtContract.PERF_ONE_DAY(); } catch(_) {}

      const qualifications = [];
      const nowUnix = Math.floor(Date.now() / 1000);
      for (let t = 0; t < 6; t++) {
        const isPending = await dtContract.pendingTiers(addr, t);
        if (isPending) {
          const isCappedAtStart = await dtContract.pendingTierCappedAtStart(addr, t);
          if (isCappedAtStart) continue; // Skip ineligible capped qualification

          const claimTime = await dtContract.qualificationMonth(addr, t);
          const claimTimeNum = Number(claimTime);
          const endClaimTime = claimTimeNum + Number(currentPerfOneDayVal);
          const isClaimWindowActive = nowUnix >= claimTimeNum && nowUnix < endClaimTime;
          qualifications.push({
            tierIndex: t,
            target: PERFORMANCE_TIERS[t].target,
            instant: PERFORMANCE_TIERS[t].instant,
            daily: PERFORMANCE_TIERS[t].daily,
            isPending,
            claimTime: claimTimeNum,
            isClaimWindowActive,
            isCappedAtStart
          });
        }
      }
      setPendingQualifications(qualifications);
      if (qualifications.length > 0) {
        console.log("[PerfBonus] Qualifications loaded:", qualifications);
      }
    } catch (e) {
      console.error("[PerfBonus] refreshPendingQualifications error:", e);
    }
  }

  // Auto-refresh pending qualifications every 10 seconds so timer appears live
  useEffect(() => {
    if (!walletConnected || !isRegistered || !walletAddress) return;
    refreshPendingQualifications(walletAddress);
    const interval = setInterval(() => {
      refreshPendingQualifications(walletAddress);
    }, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletConnected, isRegistered, walletAddress, dtInfinityAddress]);

  async function loadBlockchainData(addr, sessionTxDetails = null) {
    if (!addr || !window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const dtContract = new ethers.Contract(dtInfinityAddress, DT_INFINITY_ABI, provider);
      const usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, provider);

      let currentOneDayVal = 1800n;
      let currentPerfOneDayVal = 480n;
      try {
        const [cUSDT, wUSDT, cOneDay, cPerfOneDay] = await Promise.all([
          usdtContract.balanceOf(dtInfinityAddress),
          usdtContract.balanceOf(addr),
          dtContract.ONE_DAY(),
          dtContract.PERF_ONE_DAY()
        ]);
        setContractUSDTBalance(formatUSDT(cUSDT));
        setWalletUSDTBalance(formatUSDT(wUSDT));
        if (cOneDay) {
          currentOneDayVal = cOneDay;
          setOneDay(cOneDay);
        }
        if (cPerfOneDay) {
          currentPerfOneDayVal = cPerfOneDay;
          setPerfOneDay(cPerfOneDay);
        }
      } catch (e) {
        console.warn("Could not read contract or wallet balances", e);
      }

      const registered = await dtContract.isUserRegistered(addr);
      setIsRegistered(registered);

      if (registered) {
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

        setSecondsSinceSync(0);
        setDirectsList(directs);

        let userDeposits = [];
        let userWithdrawals = [];
        let deposits = [];
        let withdrawals = [];
        try {
          userDeposits = await dtContract.getUserDeposits(addr);
          let rawDeposits = (userDeposits || []).map((d, i) => ({
            type: "deposit",
            typeName: "Deposit",
            fromUser: addr,
            amount: parseFloat(ethers.formatUnits(d.amount || 0n, 18)),
            level: "-",
            timestamp: Number(d.time || d.timestamp || 0n),
            status: "Completed",
            txHash: `0x_dep_${addr.toLowerCase()}_${i}_${Number(d.time || d.timestamp || 0n)}`,
            blockNumber: 0
          })).filter(d => d.amount >= 0.01 && d.timestamp >= 1704067200);

          try {
            const depositLogs = await dtContract.queryFilter(dtContract.filters.DepositMade(addr));
            depositLogs.forEach((log) => {
              const parsed = dtContract.interface.parseLog(log);
              const amt = parseFloat(ethers.formatUnits(parsed.args.amount || 0n, 18));
              const time = Number(parsed.args.timestamp || 0n);
              if (amt >= 0.01 && time >= 1704067200) {
                const exists = rawDeposits.some(d => Math.abs(d.timestamp - time) < 60 && Math.abs(d.amount - amt) < 0.01);
                if (!exists) {
                  rawDeposits.push({
                    type: "deposit",
                    typeName: "Deposit",
                    fromUser: addr,
                    amount: amt,
                    level: "-",
                    timestamp: time,
                    status: "Completed",
                    txHash: log.transactionHash,
                    actualTxHash: log.transactionHash,
                    blockNumber: log.blockNumber || 0
                  });
                }
              }
            });
          } catch (logErr) {}

          rawDeposits.sort((a, b) => a.timestamp - b.timestamp);
          if (rawDeposits.length > 0) {
            setLastDepositAmount(rawDeposits[rawDeposits.length - 1].amount.toString());
          }
          deposits = rawDeposits;

          userWithdrawals = await dtContract.getUserWithdrawals(addr);
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

        let bonusesMapped = [];
        try {
          const bonuses = await dtContract.getActiveBonuses(addr);
          bonusesMapped = bonuses.map(b => {
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
          setActiveBonuses(bonusesMapped);
        } catch (e) {
          console.warn("Could not read active bonuses", e);
        }

        let qualifications = [];
        try {
          const nowUnix = Math.floor(Date.now() / 1000);
          const userDepNum = parseFloat(ethers.formatUnits(basicInfo.totalDeposits || 0n, 18));
          const maxNetCap = userDepNum * 4.0;
          const totEarnedOnChain = parseFloat(formatUSDT(incomeInfo.dailyROIEarned)) +
                                  parseFloat(formatUSDT(incomeInfo.roiBoosterEarned)) +
                                  parseFloat(formatUSDT(incomeInfo.levelIncomeEarned)) +
                                  parseFloat(formatUSDT(incomeInfo.levelROIEarned)) +
                                  parseFloat(formatUSDT(incomeInfo.performanceBonusEarned));
          const isUserCappedOnChain = userDepNum > 0 && totEarnedOnChain >= maxNetCap - 0.001;

          if (!isUserCappedOnChain) {
            for (let t = 0; t < 6; t++) {
              const isPending = await dtContract.pendingTiers(addr, t);
              if (isPending) {
                const isCappedAtStart = await dtContract.pendingTierCappedAtStart(addr, t);
                if (isCappedAtStart) continue; // Skip ineligible capped qualification

                const claimTime = await dtContract.qualificationMonth(addr, t);
                const claimTimeNum = Number(claimTime);
                const endClaimTime = claimTimeNum + Number(currentPerfOneDayVal || 86400n);
                const isClaimWindowActive = nowUnix >= claimTimeNum && nowUnix < endClaimTime;
                const isExpired = nowUnix >= endClaimTime;

                if (isExpired && !isCappedAtStart && userDepNum >= 50) {
                  const hasExistingBonus = bonusesMapped.some(b => b.tierIndex === t);
                  if (!hasExistingBonus) {
                    bonusesMapped.push({
                      tierIndex: t,
                      dailyRate: PERFORMANCE_TIERS[t].daily,
                      startTime: claimTimeNum,
                      endTime: claimTimeNum + 30 * Number(currentPerfOneDayVal || 86400n),
                      lastClaimTime: claimTimeNum,
                      isDefaultedExpired: true
                    });
                  }
                }
                
                qualifications.push({
                  tierIndex: t,
                  target: PERFORMANCE_TIERS[t].target,
                  instant: PERFORMANCE_TIERS[t].instant,
                  daily: PERFORMANCE_TIERS[t].daily,
                  isPending,
                  claimTime: claimTimeNum,
                  isClaimWindowActive,
                  isExpired,
                  isCappedAtStart
                });
              }
            }
          }
          setActiveBonuses([...bonusesMapped]);
          setPendingQualifications(qualifications);
        } catch (e) {
          console.warn("Could not read performance qualifications", e);
        }

        const simulatedEvents = generateEventsList(
          addr,
          Number(basicInfo.registrationTime),
          ethers.formatUnits(basicInfo.totalDeposits || 0n, 18),
          ethers.formatUnits((incomeInfo.dailyROIEarned || 0n) + (pending.pendingDaily || 0n), 18),
          ethers.formatUnits((incomeInfo.roiBoosterEarned || 0n) + (pending.pendingBooster || 0n), 18),
          ethers.formatUnits(incomeInfo.levelIncomeEarned || 0n, 18),
          ethers.formatUnits(incomeInfo.levelROIEarned || 0n, 18),
          ethers.formatUnits(incomeInfo.performanceBonusEarned || 0n, 18),
          Number(boosterRate) / 100,
          Number(currentOneDayVal),
          Number(currentPerfOneDayVal),
          treeNodes,
          bonusesMapped,
          deposits
        ).map(evt => ({ ...evt, isSimulated: true }));

        setOnChainEvents([...deposits, ...withdrawals, ...simulatedEvents]);

        try {
          await syncToConvex(
            addr,
            basicInfo,
            networkInfo,
            boosterRate,
            directs,
            userDeposits,
            userWithdrawals,
            simulatedEvents,
            sessionTxDetails,
            incomeInfo,
            bonusesMapped
          );
        } catch (convexErr) {
          console.warn("Failed to sync state to Convex in loadBlockchainData:", convexErr);
        }
      }
    } catch (err) {
      console.error("Error loading blockchain data", err);
    }
  }

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
      alert("Mint failed. Verify you are using the Mock USDT contract.");
    } finally {
      setLoading(false);
    }
  }

  async function parseAndSaveReceiptLogs(receipt, currentUser) {
    if (!receipt || !receipt.logs || receipt.logs.length === 0) return;
    try {
      const iface = new ethers.Interface(DT_INFINITY_ABI);
      const eventsToSave = [];

      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        try {
          const parsed = iface.parseLog(log);
          if (!parsed) continue;

          const txHash = receipt.hash.toLowerCase();
          const blockNumber = receipt.blockNumber || 0;
          const logIndex = log.index !== undefined ? log.index : i;

          if (parsed.name === "LevelIncomePaid") {
            eventsToSave.push({
              user: parsed.args.upline.toLowerCase(),
              type: "level_income",
              typeName: "Level Income",
              fromUser: parsed.args.downline.toLowerCase(),
              amount: parseFloat(ethers.formatUnits(parsed.args.amount, 18)),
              level: parsed.args.level.toString(),
              timestamp: Number(parsed.args.time),
              status: "Completed",
              txHash,
              blockNumber,
              isSimulated: false,
              logIndex,
            });
          } else if (parsed.name === "LevelROIPaid") {
            eventsToSave.push({
              user: parsed.args.upline.toLowerCase(),
              type: "level_roi",
              typeName: "Level ROI Matching",
              fromUser: parsed.args.downline.toLowerCase(),
              amount: parseFloat(ethers.formatUnits(parsed.args.amount, 18)),
              level: parsed.args.level.toString(),
              timestamp: Number(parsed.args.time),
              status: "Completed",
              txHash,
              blockNumber,
              isSimulated: false,
              logIndex,
            });
          } else if (parsed.name === "PerformanceBonusClaimed") {
            const tierIdx = Number(parsed.args.tierIndex);
            const chooseInstant = parsed.args.chooseInstant;
            const tier = PERFORMANCE_TIERS[tierIdx] || { instant: 0, daily: 0 };
            let actualAmount = chooseInstant ? tier.instant : 0;

            if (chooseInstant && receipt && receipt.logs) {
              const usdtIface = new ethers.Interface(USDT_ABI);
              const userAddrLower = parsed.args.user.toLowerCase();
              for (const rLog of receipt.logs) {
                try {
                  const uParsed = usdtIface.parseLog(rLog);
                  if (uParsed && uParsed.name === "Transfer" && uParsed.args.to.toLowerCase() === userAddrLower) {
                    const netAmt = parseFloat(ethers.formatUnits(uParsed.args.value, 18));
                    actualAmount = Math.round((netAmt / 0.90) * 100) / 100;
                    break;
                  }
                } catch (_) {}
              }
            }

            eventsToSave.push({
              user: parsed.args.user.toLowerCase(),
              type: chooseInstant ? "perf_instant" : "perf_claim",
              typeName: chooseInstant ? "Performance Bonus (Instant)" : "Performance Bonus Claimed",
              fromUser: "contract",
              amount: actualAmount,
              level: "-",
              timestamp: Number(parsed.args.time),
              status: "Completed",
              txHash,
              blockNumber,
              isSimulated: false,
              tierIndex: tierIdx,
              logIndex,
            });
          } else if (parsed.name === "PerformanceDailyPaid") {
            eventsToSave.push({
              user: parsed.args.user.toLowerCase(),
              type: "perf_daily",
              typeName: "Performance Daily Salary",
              fromUser: "contract",
              amount: parseFloat(ethers.formatUnits(parsed.args.amount, 18)),
              level: "-",
              timestamp: Number(parsed.args.time),
              status: "Completed",
              txHash,
              blockNumber,
              isSimulated: false,
              logIndex,
            });
          } else if (parsed.name === "ROIAccumulated") {
            eventsToSave.push({
              user: parsed.args.user.toLowerCase(),
              type: "roi",
              typeName: "Daily ROI Payout",
              fromUser: "contract",
              amount: parseFloat(ethers.formatUnits(parsed.args.amount, 18)),
              level: "-",
              timestamp: Number(parsed.args.time),
              status: "Completed",
              txHash,
              blockNumber,
              isSimulated: false,
              logIndex,
            });
          } else if (parsed.name === "BoosterROIAccumulated") {
            eventsToSave.push({
              user: parsed.args.user.toLowerCase(),
              type: "booster_roi",
              typeName: "Booster ROI Payout",
              fromUser: "contract",
              amount: parseFloat(ethers.formatUnits(parsed.args.amount, 18)),
              level: "-",
              timestamp: Number(parsed.args.time),
              status: "Completed",
              txHash,
              blockNumber,
              isSimulated: false,
              logIndex,
            });
          }
        } catch (e) {
          // ignore unparsed log
        }
      }

      if (eventsToSave.length > 0) {
        const eventsByUser = {};
        for (const evt of eventsToSave) {
          const targetUser = evt.user;
          if (!eventsByUser[targetUser]) eventsByUser[targetUser] = [];
          eventsByUser[targetUser].push(evt);
        }

        for (const targetUser of Object.keys(eventsByUser)) {
          await syncOnChainEventsMutation({
            contractAddress: dtInfinityAddress,
            user: targetUser,
            events: eventsByUser[targetUser],
          });
        }
      }
    } catch (err) {
      console.warn("Failed to parse and save receipt logs directly to Convex DB:", err);
    }
  }

  async function handleDeposit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!walletConnected) {
      alert("Please connect wallet first");
      return;
    }
    const val = parseFloat(depositAmount);
    if (isNaN(val) || val < 10) {
      alert("Minimum deposit is 10 USDT");
      return;
    }

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

      const allowance = await usdtContract.allowance(walletAddress, dtInfinityAddress);
      if (allowance < parsedAmount) {
        const approveTx = await usdtContract.approve(dtInfinityAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      const sponsor = isRegistered ? ethers.ZeroAddress : sponsorAddress;
      const tx = await dtContract.deposit(parsedAmount, sponsor);
      const receipt = await tx.wait();

      const txDetailsObj = {
        type: "deposit",
        hash: receipt.hash,
        time: Math.floor(Date.now() / 1000)
      };
      setLatestTxDetails(txDetailsObj);

      await parseAndSaveReceiptLogs(receipt, walletAddress);

      setIsRegistered(true);
      setActiveView("dashboard");

      await loadBlockchainData(walletAddress, txDetailsObj);
      alert("Deposit processed successfully!");
    } catch (err) {
      alert("Deposit failed or was rejected by wallet.");
    } finally {
      setLoading(false);
    }
  }

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

      const txDetailsObj = {
        type: "withdraw",
        hash: receipt.hash,
        time: Math.floor(Date.now() / 1000)
      };
      setLatestTxDetails(txDetailsObj);

      await parseAndSaveReceiptLogs(receipt, walletAddress);

      alert("All rewards claimed and transferred successfully!");
      await loadBlockchainData(walletAddress, txDetailsObj);
    } catch (err) {
      alert("Claim transaction failed or was rejected.");
    } finally {
      setLoading(false);
    }
  }

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
      const receipt = await tx.wait();

      const txDetailsObj = {
        type: chooseInstant ? "perf_instant" : "perf_claim",
        hash: receipt.hash,
        time: Math.floor(Date.now() / 1000)
      };
      setLatestTxDetails(txDetailsObj);

      await parseAndSaveReceiptLogs(receipt, walletAddress);

      alert(`Performance Bonus Tier ${tierIndex + 1} claimed successfully!`);
      await loadBlockchainData(walletAddress, txDetailsObj);
    } catch (err) {
      alert("Failed to claim Performance Bonus. Verify the claim window is active.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncMissedTx() {
    if (!missedTxHash || missedTxHash.trim().length < 42) {
      alert("Please enter a valid transaction hash");
      return;
    }
    try {
      setSyncingMissed(true);
      const result = await syncMissedTxAction({
        txHash: missedTxHash.trim(),
        dtInfinityAddress,
      });

      if (result.success) {
        alert(`Successfully recovered and synced ${result.type} transaction!`);
        setMissedTxHash("");
        if (walletAddress) {
          await loadBlockchainData(walletAddress);
        }
      } else {
        alert(`Sync failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Sync Action Error: ${err.message}`);
    } finally {
      setSyncingMissed(false);
    }
  }

  function copyReferralLink() {
    if (!walletConnected) return;
    const link = `${origin}/?ref=${walletAddress}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopyText("Copied");
      setTimeout(() => setCopyText("Copy"), 1500);
    });
  }

  const displayPendingDaily = parseFloat(pendingBalances.pendingDaily) || 0;
  const displayPendingBooster = parseFloat(pendingBalances.pendingBooster) || 0;
  const displayPendingPerf = parseFloat(pendingBalances.pendingPerf) || 0;

  const totalDepositsNum = parseFloat(userData.totalDeposits) || 0;
  const maxRoiCap = totalDepositsNum * 2.2;
  const maxNetworkCap = totalDepositsNum * 4.0;

  const lifetimeTeamVolume = useMemo(() => {
    if (!walletConnected || !isRegistered || !walletAddress || !dbTreeNodes) return 0;
    let sum = 0;
    const rootLower = walletAddress.toLowerCase();
    Object.keys(dbTreeNodes).forEach(addr => {
      if (addr.toLowerCase() === rootLower) return;
      const node = dbTreeNodes[addr];
      if (node && node.totalDeposits) {
        sum += parseFloat(node.totalDeposits) || 0;
      }
    });
    return sum;
  }, [dbTreeNodes, walletAddress, walletConnected, isRegistered]);

  const effectiveActiveBonuses = useMemo(() => {
    const list = [];
    (activeBonuses || []).forEach(b => {
      const isDup = list.some(existing => 
        (existing.tierIndex !== undefined && existing.tierIndex === b.tierIndex) ||
        Math.abs(existing.startTime - b.startTime) < 300
      );
      if (!isDup) list.push(b);
    });

    // Populate active bonuses from on-chain claiming event logs (perf_claim / perf_claim_option2)
    (dbLedger || []).forEach(e => {
      if (e.type === "perf_claim" && e.tierIndex !== undefined) {
        const tier = Number(e.tierIndex);
        const rate = PERFORMANCE_TIERS[tier]?.daily || 5;
        const exists = list.some(b => b.tierIndex === tier);
        if (!exists) {
          list.push({
            tierIndex: tier,
            dailyRate: rate,
            startTime: e.timestamp,
            endTime: e.timestamp + 30 * (Number(perfOneDay || 86400n)),
            lastClaimTime: e.timestamp
          });
        }
      }
    });

    // Identify performance tiers that have already been claimed via Instant Payment Option (perf_instant)
    const instantClaimedTiers = new Set();
    (dbLedger || []).forEach(e => {
      if (e.type === "perf_instant") {
        if (e.tierIndex !== undefined) {
          instantClaimedTiers.add(e.tierIndex);
        } else {
          PERFORMANCE_TIERS.forEach((t, idx) => {
            if (Math.abs((parseFloat(e.amount) || 0) - t.instant) < 0.01) {
              instantClaimedTiers.add(idx);
            }
          });
        }
      }
    });

    const nowUnix = Math.floor(Date.now() / 1000);
    const userDepNum = parseFloat(userData.totalDeposits || "0");
    const regTimeNum = Number(userData.registrationTime || 0);

    const totalEarnedSoFar = parseFloat(userData.levelIncomeEarned || "0") +
                            parseFloat(userData.levelROIEarned || "0") +
                            parseFloat(userData.performanceBonusEarned || "0") +
                            parseFloat(userData.dailyROIEarned || "0") +
                            parseFloat(userData.roiBoosterEarned || "0");
    const maxNetworkCap = userDepNum * 4.0;
    if (userDepNum > 0 && totalEarnedSoFar >= maxNetworkCap) {
      return [];
    }

    (pendingQualifications || []).forEach(qual => {
      const claimTimeNum = Number(qual.claimTime);
      const endClaimTime = claimTimeNum + Number(perfOneDay || 60n);
      const isExpired = nowUnix >= endClaimTime;
      if (isExpired && !qual.isCappedAtStart && userDepNum >= 50) {
        if (!instantClaimedTiers.has(qual.tierIndex)) {
          const exists = list.some(b => 
            (b.tierIndex !== undefined && b.tierIndex === qual.tierIndex) ||
            Math.abs(b.startTime - claimTimeNum) < 300
          );
          if (!exists) {
            list.push({
              tierIndex: qual.tierIndex,
              dailyRate: PERFORMANCE_TIERS[qual.tierIndex].daily,
              startTime: claimTimeNum,
              endTime: claimTimeNum + 30 * Number(perfOneDay || 60n),
              lastClaimTime: claimTimeNum
            });
          }
        }
      }
    });

    // Fallback: If team volume meets Tier target and user meets leg requirements (strongLeg >= target && otherLegs >= target)
    let calculatedStrongLeg = 0;
    let calculatedTotalVol = 0;
    if (walletAddress && dbTreeNodes) {
      const rootLower = walletAddress.toLowerCase();
      const directAddrs = (dbTreeNodes[rootLower]?.children) || [];
      const legVolumes = [];

      directAddrs.forEach(childAddr => {
        let legSum = 0;
        const queue = [childAddr.toLowerCase()];
        const visited = new Set(queue);
        while (queue.length > 0) {
          const current = queue.shift();
          const node = dbTreeNodes[current];
          if (node) {
            legSum += parseFloat(node.totalDeposits || 0);
            (node.children || []).forEach(subChild => {
              const subLower = subChild.toLowerCase();
              if (!visited.has(subLower)) {
                visited.add(subLower);
                queue.push(subLower);
              }
            });
          }
        }
        legVolumes.push(legSum);
      });

      if (legVolumes.length > 0) {
        calculatedStrongLeg = Math.max(...legVolumes);
        calculatedTotalVol = legVolumes.reduce((a, b) => a + b, 0);
      }
    }

    const strongLeg = Math.max(parseFloat(userData.strongestLegVolume || "0"), calculatedStrongLeg);
    const totalVol = Math.max(parseFloat(userData.totalTeamVolume || "0"), calculatedTotalVol, lifetimeTeamVolume || 0);
    const otherLegs = Math.max(0, totalVol - strongLeg);

    if (userDepNum >= 50 && regTimeNum > 0 && list.length === 0) {
      let highestQualifiedIdx = -1;
      PERFORMANCE_TIERS.forEach((tier, tIdx) => {
        if (!instantClaimedTiers.has(tIdx)) {
          if (strongLeg >= tier.target && otherLegs >= tier.target) {
            highestQualifiedIdx = tIdx;
          }
        }
      });

      if (highestQualifiedIdx >= 0) {
        const tier = PERFORMANCE_TIERS[highestQualifiedIdx];
        const qualClaimTime = (pendingQualifications && pendingQualifications.length > 0 && Number(pendingQualifications[0].claimTime) > 0) 
          ? Number(pendingQualifications[0].claimTime) 
          : 1784773800;
        list.push({
          tierIndex: highestQualifiedIdx,
          dailyRate: tier.daily,
          startTime: qualClaimTime,
          endTime: qualClaimTime + 30 * Number(perfOneDay || 60n),
          lastClaimTime: qualClaimTime
        });
      }
    }

    return list;
  }, [activeBonuses, pendingQualifications, perfOneDay, userData.totalDeposits, userData.registrationTime, userData.totalTeamVolume, lifetimeTeamVolume, secondsSinceSync, dbLedger]);

  const unmergedTxs = useMemo(() => {
    const ledger = dbLedger || [];
    const activeAddress = targetAddressForLedger || walletAddress;
    if (!activeAddress && ledger.length === 0) return [];
    const realDeposits = ledger.filter(e => e.type === "deposit");
    const realWithdrawals = ledger.filter(e => e.type === "withdraw");
    // Exclude bulk on-chain ROI events and bulk on-chain performance daily events to display every payout independently
    const realEvents = ledger.filter(e => 
      e.type !== "deposit" && 
      e.type !== "withdraw" && 
      e.type !== "roi" && 
      e.type !== "booster_roi" && 
      e.type !== "perf_daily" && 
      !e.isSimulated && 
      e.blockNumber && 
      e.blockNumber > 0 && 
      e.txHash && 
      e.txHash.length === 66 && 
      !e.txHash.includes("_") &&
      !e.txHash.includes("gen") &&
      !e.txHash.includes("salary") &&
      !e.txHash.includes("rem")
    );

    // Dynamically generate simulated candidate events based on live ticking time (every interval separately)
    const simulatedEvents = generateEventsList(
      targetAddressForLedger || walletAddress,
      Number(userData.registrationTime || 0),
      userData.totalDeposits || "0",
      "0",
      "0",
      userData.levelIncomeEarned || "0",
      "0",
      "0",
      parseFloat(userData.boosterRate || "0.5"),
      Number(oneDay || 1800n),
      Number(perfOneDay || 480n),
      treeNodes,
      effectiveActiveBonuses,
      realDeposits,
      ledger
    ).map(evt => ({ ...evt, isSimulated: true }));

    const baseTxs = [...realEvents, ...realDeposits, ...realWithdrawals];

    simulatedEvents.forEach(sim => {
      if (sim.type === "roi" || sim.type === "booster_roi" || sim.type === "perf_daily") {
        baseTxs.push(sim);
      } else {
        const normSimType = (sim.type || "").replace("candidate_", "");
        const isDuplicate = realEvents.some(real => {
          const normRealType = (real.type || "").replace("candidate_", "");
          const isSameUser = real.fromUser && sim.fromUser && real.fromUser.toLowerCase() === sim.fromUser.toLowerCase();
          const isSameLevel = String(real.level) === String(sim.level);
          return normRealType === normSimType && (isSameUser || (isSameLevel && Math.abs(real.timestamp - sim.timestamp) < 300));
        });
        if (!isDuplicate) {
          baseTxs.push(sim);
        }
      }
    });

    baseTxs.sort((a, b) => {
      const diff = sortOrder === "asc" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
      if (diff !== 0) return diff;
      const priorityMapAsc = { roi: 0, booster_roi: 0, level_income: 1, level_roi: 1, deposit: 2, withdraw: 2, perf_daily: 3, perf_instant: 3, perf_claim: 3 };
      const priorityMapDesc = { perf_daily: 4, perf_instant: 4, perf_claim: 4, roi: 3, booster_roi: 3, level_income: 2, level_roi: 2, withdraw: 1, deposit: 0 };
      const priorityMap = sortOrder === "asc" ? priorityMapAsc : priorityMapDesc;
      const prioA = priorityMap[a.type] !== undefined ? priorityMap[a.type] : 1;
      const prioB = priorityMap[b.type] !== undefined ? priorityMap[b.type] : 1;
      return prioA - prioB;
    });

    return baseTxs;
  }, [dbLedger, walletConnected, isRegistered, sortOrder, userData, oneDay, perfOneDay, treeNodes, effectiveActiveBonuses, secondsSinceSync, walletAddress]);

  const txs = useMemo(() => {
    return unmergedTxs;
  }, [unmergedTxs]);

  const statsToDisplay = useMemo(() => {
    let dailyROI = 0;
    let boosterROI = 0;
    let levelIncome = 0;
    let levelROI = 0;
    let performance = 0;
    let perfDailyInContract = 0;

    unmergedTxs.forEach(tx => {
      if (tx.type === "roi") dailyROI += tx.amount;
      else if (tx.type === "booster_roi") boosterROI += tx.amount;
      else if (tx.type === "level_income") levelIncome += tx.amount;
      else if (tx.type === "level_roi") levelROI += tx.amount;
      else if (["perf_instant", "perf_daily", "perf_claim"].includes(tx.type)) {
        performance += tx.amount;
        if (tx.type !== "perf_instant") {
          perfDailyInContract += tx.amount;
        }
      }
    });

    if (dailyROI === 0 && parseFloat(userData.dailyROIEarned || "0") > 0 && (!walletConnected || !isRegistered)) {
      dailyROI = parseFloat(userData.dailyROIEarned || "0");
    }
    if (boosterROI === 0 && parseFloat(userData.roiBoosterEarned || "0") > 0 && (!walletConnected || !isRegistered)) {
      boosterROI = parseFloat(userData.roiBoosterEarned || "0");
    }
    if (levelIncome === 0 && parseFloat(userData.levelIncomeEarned || "0") > 0 && (!walletConnected || !isRegistered)) {
      levelIncome = parseFloat(userData.levelIncomeEarned || "0");
    }
    if (levelROI === 0 && parseFloat(userData.levelROIEarned || "0") > 0 && (!walletConnected || !isRegistered)) {
      levelROI = parseFloat(userData.levelROIEarned || "0");
    }
    if (performance === 0 && (!effectiveActiveBonuses || effectiveActiveBonuses.length === 0)) {
      performance = parseFloat(userData.performanceBonusEarned || "0");
    }

    const totalEarned = Math.min(dailyROI + boosterROI + levelIncome + levelROI + performance, maxNetworkCap);
    const totalWithdrawnNum = parseFloat(userData.totalWithdrawn || "0");
    // Level Income & Instant Performance Bonus are transferred directly to wallet on deposit/claim, so only contract-accumulated yields (ROI, Level ROI, Perf Daily stream) remain claimable in contract
    const claimableInContract = Math.max(0, Math.min(dailyROI + boosterROI + levelROI + perfDailyInContract, maxNetworkCap) - totalWithdrawnNum);

    return {
      dailyROI: dailyROI.toFixed(2),
      boosterROI: boosterROI.toFixed(2),
      levelIncome: levelIncome.toFixed(2),
      levelROI: levelROI.toFixed(2),
      performance: performance.toFixed(2),
      totalROI: (dailyROI + boosterROI).toFixed(2),
      totalEarned: totalEarned.toFixed(2),
      totalAvailable: claimableInContract.toFixed(2)
    };
  }, [unmergedTxs, userData, displayPendingDaily, displayPendingBooster, displayPendingPerf, maxNetworkCap]);

  const lifetimeTeamVol = useMemo(() => {
    if (!treeNodes || !walletAddress) return parseFloat(userData.totalTeamVolume || "0");
    let total = 0;
    const visited = new Set();
    const queue = [walletAddress.toLowerCase()];
    visited.add(walletAddress.toLowerCase());

    while (queue.length > 0) {
      const currentAddr = queue.shift();
      const node = treeNodes[currentAddr];
      if (node && node.children) {
        for (const childAddr of node.children) {
          const childLower = childAddr.toLowerCase();
          if (!visited.has(childLower)) {
            visited.add(childLower);
            const childNode = treeNodes[childLower];
            if (childNode) {
              total += parseFloat(childNode.totalDeposits || "0");
            }
            queue.push(childLower);
          }
        }
      }
    }
    return Math.max(total, parseFloat(userData.totalTeamVolume || "0"));
  }, [treeNodes, walletAddress, userData.totalTeamVolume]);

  const totalAvailableBalance = parseFloat(statsToDisplay.totalAvailable).toFixed(2);
  const totalEarnedAcrossStreams = parseFloat(statsToDisplay.totalEarned).toFixed(2);
  const currentRoiEarned = parseFloat(statsToDisplay.totalEarned);
  const roiCapPercent = maxRoiCap > 0 ? Math.min((currentRoiEarned / maxRoiCap) * 100, 100) : 0;
  const currentNetworkEarned = parseFloat(statsToDisplay.totalEarned);
  const networkCapPercent = maxNetworkCap > 0 ? Math.min((currentNetworkEarned / maxNetworkCap) * 100, 100) : 0;

  const filteredTxs = useMemo(() => {
    return txs.filter(tx => {
      if (parseFloat(tx.amount.toFixed(2)) === 0) return false;
      if (tx.status && tx.status.startsWith("Pending")) return false;

      if (filterType !== "all") {
        if (filterType === "deposit" && tx.type !== "deposit") return false;
        if (filterType === "withdraw" && tx.type !== "withdraw") return false;
        if (filterType === "roi" && tx.type !== "roi") return false;
        if (filterType === "booster_roi" && tx.type !== "booster_roi") return false;
        if (filterType === "level_income" && tx.type !== "level_income") return false;
        if (filterType === "level_roi" && tx.type !== "level_roi") return false;
        if (filterType === "performance" && !["perf_instant", "perf_daily", "perf_claim"].includes(tx.type)) return false;
      }

      if (filterLevel !== "all" && tx.level.toString() !== filterLevel) return false;
      if (searchLevel && tx.level.toString().toLowerCase() !== searchLevel.trim().toLowerCase()) return false;

      if (filterStartDate) {
        const startSecs = new Date(filterStartDate).getTime() / 1000;
        if (tx.timestamp < startSecs) return false;
      }
      if (filterEndDate) {
        const endSecs = new Date(filterEndDate).getTime() / 1000 + 86400;
        if (tx.timestamp > endSecs) return false;
      }

      if (searchFromUser) {
        const searchStr = searchFromUser.trim().toLowerCase();
        if (!tx.fromUser.toLowerCase().includes(searchStr)) return false;
      }

      return true;
    });
  }, [txs, filterType, filterLevel, searchLevel, filterStartDate, filterEndDate, searchFromUser]);

  const totalSelectedIncome = useMemo(() => {
    const incomeTypes = ["roi", "booster_roi", "level_income", "level_roi", "perf_instant", "perf_daily"];
    return filteredTxs.filter(tx => incomeTypes.includes(tx.type)).reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const itemsPerPage = 20;
  const paginatedTxs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTxs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTxs, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTxs.length / itemsPerPage));

  const handleExportCSV = () => {
    if (filteredTxs.length === 0) {
      alert("No records to export.");
      return;
    }
    const headers = ["Index", "Type", "Source User", "Amount (USDT)", "Level", "Date Time", "Status"];
    const rows = filteredTxs.map((tx, idx) => {
      const dateTime = new Date(tx.timestamp * 1000).toISOString().replace("T", " ").substring(0, 19);
      return [idx + 1, tx.typeName || tx.type, tx.fromUser || "-", tx.amount.toFixed(4), tx.level || "-", dateTime, tx.status || "Completed"];
    });
    const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `dt_infinity_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (filteredTxs.length === 0) {
      alert("No records to export.");
      return;
    }
    const reportData = filteredTxs.map((tx, idx) => {
      const dateTime = new Date(tx.timestamp * 1000).toISOString().replace("T", " ").substring(0, 19);
      return { index: idx + 1, type: tx.type, typeName: tx.typeName || tx.type, fromUser: tx.fromUser || "-", amount: tx.amount, level: tx.level || "-", timestamp: tx.timestamp, dateTime, status: tx.status || "Completed" };
    });
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `dt_infinity_report_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  if (!isRegistered) {
    return (
      <div className="shell" style={{ gridTemplateColumns: "1fr" }}>
        <main className="main" style={{ maxWidth: "680px", margin: "0 auto", padding: "20px 16px" }}>
          <Navbar
            walletConnected={walletConnected}
            walletAddress={walletAddress}
            networkName={networkName}
            isWrongNetwork={isWrongNetwork}
            targetChainId={targetChainId}
            loading={loading}
            connectWallet={connectWallet}
            disconnectWallet={disconnectWallet}
            switchNetwork={switchNetwork}
            setSidebarOpen={setSidebarOpen}
            setShowSettings={setShowSettings}
            setShowMissedTxModal={setShowMissedTxModal}
            isRegistered={isRegistered}
          />
          <DepositView
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            sponsorAddress={sponsorAddress}
            setSponsorAddress={setSponsorAddress}
            isRegistered={isRegistered}
            walletAddress={walletAddress}
            walletUSDTBalance={walletUSDTBalance}
            handleDeposit={handleDeposit}
            handleMintUSDT={handleMintUSDT}
            loading={loading}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <main className="main">
        <Navbar
          walletConnected={walletConnected}
          walletAddress={walletAddress}
          networkName={networkName}
          isWrongNetwork={isWrongNetwork}
          targetChainId={targetChainId}
          loading={loading}
          connectWallet={connectWallet}
          disconnectWallet={disconnectWallet}
          switchNetwork={switchNetwork}
          setSidebarOpen={setSidebarOpen}
          setShowSettings={setShowSettings}
          setShowMissedTxModal={setShowMissedTxModal}
          isRegistered={isRegistered}
        />

        {activeView === "dashboard" && (
          <DashboardView
            userData={userData}
            pendingBalances={pendingBalances}
            pendingQualifications={pendingQualifications}
            networkCapPercent={networkCapPercent}
            roiCapPercent={roiCapPercent}
            maxRoiCap={maxRoiCap}
            maxNetworkCap={maxNetworkCap}
            totalAvailableBalance={totalAvailableBalance}
            totalEarnedAcrossStreams={totalEarnedAcrossStreams}
            statsToDisplay={statsToDisplay}
            origin={origin}
            walletAddress={walletAddress}
            copyText={copyText}
            copyReferralLink={copyReferralLink}
            handleClaimPerformance={handleClaimPerformance}
            handleClaimAll={handleClaimAll}
            loading={loading}
            setActiveView={setActiveView}
            perfOneDay={perfOneDay}
            lifetimeTeamVol={lifetimeTeamVol.toFixed(2)}
          />
        )}

        {activeView === "deposit" && (
          <DepositView
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            sponsorAddress={sponsorAddress}
            setSponsorAddress={setSponsorAddress}
            isRegistered={isRegistered}
            walletAddress={walletAddress}
            walletUSDTBalance={walletUSDTBalance}
            handleDeposit={handleDeposit}
            handleMintUSDT={handleMintUSDT}
            loading={loading}
          />
        )}

        {activeView === "withdraw" && (
          <WithdrawView
            userData={userData}
            pendingBalances={pendingBalances}
            totalAvailableBalance={totalAvailableBalance}
            pendingQualifications={pendingQualifications}
            activeBonuses={activeBonuses}
            handleClaimAll={handleClaimAll}
            handleClaimPerformance={handleClaimPerformance}
            loading={loading}
            perfOneDay={perfOneDay}
          />
        )}

        {activeView === "network" && (
          <NetworkView
            userData={userData}
            lifetimeTeamVolume={lifetimeTeamVolume}
            treeRoot={treeRoot}
            treeNodes={treeNodes}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            loadTreeNode={loadTreeNode}
            setLoading={setLoading}
          />
        )}

        {(activeView === "reports" || activeView === "history") && (
          <ReportsView
            filteredTxs={filteredTxs}
            paginatedTxs={paginatedTxs}
            totalSelectedIncome={totalSelectedIncome}
            filterType={filterType}
            setFilterType={setFilterType}
            filterLevel={filterLevel}
            setFilterLevel={setFilterLevel}
            searchLevel={searchLevel}
            setSearchLevel={setSearchLevel}
            filterStartDate={filterStartDate}
            setFilterStartDate={setFilterStartDate}
            filterEndDate={filterEndDate}
            setFilterEndDate={setFilterEndDate}
            searchFromUser={searchFromUser}
            setSearchFromUser={setSearchFromUser}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            todayStr={todayStr}
            handleExportCSV={handleExportCSV}
            handleExportJSON={handleExportJSON}
          />
        )}
      </main>

      <SettingsModal
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        dtInfinityAddress={dtInfinityAddress}
        setDtInfinityAddress={setDtInfinityAddress}
        usdtAddress={usdtAddress}
        setUsdtAddress={setUsdtAddress}
        targetChainId={targetChainId}
        setTargetChainId={setTargetChainId}
        deploymentBlock={deploymentBlock}
        setDeploymentBlock={setDeploymentBlock}
        handleSaveConfig={handleSaveConfig}
        handleResetCache={handleResetCache}
      />

      <MissedTxModal
        showMissedTxModal={showMissedTxModal}
        setShowMissedTxModal={setShowMissedTxModal}
        missedTxHash={missedTxHash}
        setMissedTxHash={setMissedTxHash}
        syncingMissed={syncingMissed}
        handleSyncMissedTx={handleSyncMissedTx}
      />
    </div>
  );
}
