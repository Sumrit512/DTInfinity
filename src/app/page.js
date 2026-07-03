"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

// Default contract addresses (placeholders that user can update in settings)
const DEFAULT_DT_INFINITY_ADDRESS = "0x1e715b9da985ffa43859b164d0b1f36f024e72cc";
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
  "function getUserIncomeInfo(address user) external view returns (uint256 dailyROIEarned, uint256 roiBoosterEarned, uint256 levelIncomeEarned, uint256 levelROIEarned, uint256 performanceBonusEarned, uint256 registrationIncomeEarned)",
  "function getUserNetworkInfo(address user) external view returns (uint256 directCount, uint256 qualifiedDirectsCount, uint256 totalTeamCount, uint256 totalTeamVolume, address strongestLegAddress, uint256 strongestLegVolume)",
  "function getPendingBalances(address userAddr) external view returns (uint256 pendingDaily, uint256 pendingBooster, uint256 pendingPerf)",
  "function userLegVolume(address sponsor, address directReferral) external view returns (uint256)",
  "event Registered(address indexed user, address indexed sponsor, uint256 time)",
  "event Deposited(address indexed user, uint256 amount, uint256 time)",
  "event Withdrawn(address indexed user, uint256 amount, uint256 time)",
  "event LevelIncomePaid(address indexed upline, address indexed downline, uint256 level, uint256 amount)",
  "event LevelROIPaid(address indexed upline, address indexed downline, uint256 level, uint256 amount)",
  "event PerformanceBonusAchieved(address indexed user, uint256 tierIndex, uint256 instantReward)",
  "event RegistrationIncomePaid(address indexed upline, address indexed downline, uint256 level, uint256 amount)"
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
  const [txs, setTxs] = useState([]);
  const [copyText, setCopyText] = useState("Copy");
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);
  const [targetChainId, setTargetChainId] = useState(97n);

  const [treeRoot, setTreeRoot] = useState("");
  const [treeNodes, setTreeNodes] = useState({});
  const [selectedNode, setSelectedNode] = useState("");

  // Contract Addresses (Configurable by user)
  const [dtInfinityAddress, setDtInfinityAddress] = useState(DEFAULT_DT_INFINITY_ADDRESS);
  const [usdtAddress, setUsdtAddress] = useState(DEFAULT_USDT_ADDRESS);

  // Form states
  const [depositAmount, setDepositAmount] = useState("10");
  const [sponsorAddress, setSponsorAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddressInput, setWithdrawAddressInput] = useState("");

  // Live Smart Contract Data
  const [contractUSDTBalance, setContractUSDTBalance] = useState("0.00");
  const [walletUSDTBalance, setWalletUSDTBalance] = useState("0.00");
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
    registrationIncomeEarned: "0.00",
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
  const [origin, setOrigin] = useState("");

  // Load saved contract configuration
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      const savedDT = localStorage.getItem("DT_INFINITY_ADDRESS");
      const savedUSDT = localStorage.getItem("USDT_ADDRESS");
      const savedChain = localStorage.getItem("TARGET_CHAIN_ID");
      if (savedDT) setDtInfinityAddress(savedDT);
      if (savedUSDT) setUsdtAddress(savedUSDT);
      if (savedChain) setTargetChainId(BigInt(savedChain));

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

  // Save contract configuration
  const handleSaveConfig = () => {
    localStorage.setItem("DT_INFINITY_ADDRESS", dtInfinityAddress);
    localStorage.setItem("USDT_ADDRESS", usdtAddress);
    localStorage.setItem("TARGET_CHAIN_ID", targetChainId.toString());
    alert("Smart contract addresses updated successfully!");
    if (walletConnected) {
      loadBlockchainData(walletAddress);
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
      
      const [basicInfo, networkInfo, directs] = await Promise.all([
        contract.getUserBasicInfo(addr),
        contract.getUserNetworkInfo(addr),
        contract.getDirectReferrals(addr)
      ]);
      
      const nodeData = {
        address: addr,
        sponsor: basicInfo.sponsor,
        totalDeposits: formatUSDT(basicInfo.totalDeposits),
        registrationTime: Number(basicInfo.registrationTime),
        directCount: Number(networkInfo.directCount),
        qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount),
        totalTeamCount: Number(networkInfo.totalTeamCount),
        totalTeamVolume: formatUSDT(networkInfo.totalTeamVolume),
        strongestLegAddress: networkInfo.strongestLegAddress,
        strongestLegVolume: formatUSDT(networkInfo.strongestLegVolume),
        children: directs
      };
      
      setTreeNodes(prev => ({
        ...prev,
        [addr.toLowerCase()]: nodeData
      }));
    } catch (e) {
      console.error("Failed to load tree node", addr, e);
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
          registrationIncomeEarned: formatUSDT(incomeInfo.registrationIncomeEarned),
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
        setTreeNodes(prev => ({
          ...prev,
          [addr.toLowerCase()]: {
            address: addr,
            sponsor: basicInfo.sponsor,
            totalDeposits: formatUSDT(basicInfo.totalDeposits),
            registrationTime: Number(basicInfo.registrationTime),
            directCount: Number(networkInfo.directCount),
            qualifiedDirectsCount: Number(networkInfo.qualifiedDirectsCount),
            totalTeamCount: Number(networkInfo.totalTeamCount),
            totalTeamVolume: formatUSDT(networkInfo.totalTeamVolume),
            strongestLegAddress: networkInfo.strongestLegAddress,
            strongestLegVolume: formatUSDT(networkInfo.strongestLegVolume),
            children: directs
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

        setDirectsList(directs);

        // Load transaction logs from contract events
        fetchEventLogs(dtContract, addr);
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
          registrationIncomeEarned: "0.00",
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
        setTxs([]);
      }
    } catch (err) {
      console.error("Error loading blockchain data", err);
    }
  }

  // Query events to build a live transaction history
  async function fetchEventLogs(dtContract, addr) {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const currentBlock = await provider.getBlockNumber();
      const startBlock = currentBlock - 5000 > 0 ? currentBlock - 5000 : 0; // Look back last 5000 blocks

      // Create filters
      const filterDeposited = dtContract.filters.Deposited(addr);
      const filterWithdrawn = dtContract.filters.Withdrawn(addr);
      const filterLevelIncome = dtContract.filters.LevelIncomePaid(addr);
      const filterLevelROI = dtContract.filters.LevelROIPaid(addr);
      const filterBonus = dtContract.filters.PerformanceBonusAchieved(addr);
      const filterRegIncome = dtContract.filters.RegistrationIncomePaid(addr);

      // Query events
      const [depEvts, withEvts, incEvts, roiEvts, bonEvts, regIncEvts] = await Promise.all([
        dtContract.queryFilter(filterDeposited, startBlock, currentBlock),
        dtContract.queryFilter(filterWithdrawn, startBlock, currentBlock),
        dtContract.queryFilter(filterLevelIncome, startBlock, currentBlock),
        dtContract.queryFilter(filterLevelROI, startBlock, currentBlock),
        dtContract.queryFilter(filterBonus, startBlock, currentBlock),
        dtContract.queryFilter(filterRegIncome, startBlock, currentBlock)
      ]);

      const list = [];

      depEvts.forEach(e => {
        list.push({
          type: "deposit",
          tagClass: "tag roi",
          typeName: "New Deposit",
          detail: "Wallet funding",
          amount: `+${formatUSDT(e.args.amount)}`,
          blockNumber: e.blockNumber
        });
      });

      withEvts.forEach(e => {
        list.push({
          type: "withdraw",
          tagClass: "tag bonus",
          typeName: "Withdrawal",
          detail: "USDT payout",
          amount: `-${formatUSDT(e.args.amount)}`,
          blockNumber: e.blockNumber
        });
      });

      incEvts.forEach(e => {
        list.push({
          type: "level_income",
          tagClass: "tag level",
          typeName: "Level Income",
          detail: `Level ${e.args.level.toString()} · ${shorten(e.args.downline)}`,
          amount: `+${formatUSDT(e.args.amount)}`,
          blockNumber: e.blockNumber
        });
      });

      roiEvts.forEach(e => {
        list.push({
          type: "level_roi",
          tagClass: "tag level",
          typeName: "Level ROI",
          detail: `Level ${e.args.level.toString()} · ${shorten(e.args.downline)}`,
          amount: `+${formatUSDT(e.args.amount)}`,
          blockNumber: e.blockNumber
        });
      });

      bonEvts.forEach(e => {
        list.push({
          type: "bonus",
          tagClass: "tag bonus",
          typeName: "Bonus",
          detail: `Rank Bonus · Tier ${(Number(e.args.tierIndex)+1).toString()}`,
          amount: `+${formatUSDT(e.args.instantReward)}`,
          blockNumber: e.blockNumber
        });
      });

      regIncEvts.forEach(e => {
        list.push({
          type: "registration_income",
          tagClass: "tag level",
          typeName: "Reg Income",
          detail: `Level ${e.args.level.toString()} · ${shorten(e.args.downline)}`,
          amount: `+${formatUSDT(e.args.amount)}`,
          blockNumber: e.blockNumber
        });
      });

      // Sort by block number descending
      list.sort((a, b) => b.blockNumber - a.blockNumber);
      setTxs(list.slice(0, 10)); // Take top 10 events
    } catch (e) {
      console.warn("Could not query contract event logs", e);
    }
  }

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
      await tx.wait();

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
      await tx.wait();

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
      await tx.wait();

      alert("All rewards claimed and transferred successfully!");
      await loadBlockchainData(walletAddress);
    } catch (err) {
      console.error(err);
      alert("Claim transaction failed or was rejected.");
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

  // Combined available balance (On-chain claimable + real-time pending ROI)
  const totalAvailableBalance = (
    parseFloat(userData.claimableBalance) + 
    parseFloat(pendingBalances.pendingDaily) + 
    parseFloat(pendingBalances.pendingBooster) + 
    parseFloat(pendingBalances.pendingPerf)
  ).toFixed(2);

  const totalEarnedAcrossStreams = (
    parseFloat(userData.dailyROIEarned) +
    parseFloat(userData.roiBoosterEarned) +
    parseFloat(userData.levelIncomeEarned) +
    parseFloat(userData.levelROIEarned) +
    parseFloat(userData.performanceBonusEarned) +
    parseFloat(userData.registrationIncomeEarned) +
    parseFloat(pendingBalances.pendingDaily) +
    parseFloat(pendingBalances.pendingBooster) +
    parseFloat(pendingBalances.pendingPerf)
  ).toFixed(2);

  // Capping Calculations (220% ROI / 400% Network)
  const totalDepositsNum = parseFloat(userData.totalDeposits) || 0;
  
  const maxRoiCap = totalDepositsNum * 2.2;
  const currentRoiEarned = 
    parseFloat(userData.dailyROIEarned) +
    parseFloat(userData.roiBoosterEarned) +
    parseFloat(pendingBalances.pendingDaily) +
    parseFloat(pendingBalances.pendingBooster);
  const roiCapPercent = maxRoiCap > 0 ? Math.min((currentRoiEarned / maxRoiCap) * 100, 100) : 0;

  const maxNetworkCap = totalDepositsNum * 4.0;
  const currentNetworkEarned = 
    parseFloat(userData.levelIncomeEarned) +
    parseFloat(userData.levelROIEarned) +
    parseFloat(userData.performanceBonusEarned) +
    parseFloat(userData.registrationIncomeEarned) +
    parseFloat(pendingBalances.pendingPerf);
  const networkCapPercent = maxNetworkCap > 0 ? Math.min((currentNetworkEarned / maxNetworkCap) * 100, 100) : 0;

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
              <strong style={{ color: "var(--blue-bright)" }}>Registration Required:</strong> To activate your node and participate in the Daily ROI & MLM Network, please enter your sponsor's address and execute your initial deposit (min 10 USDT).
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
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand" style={{ padding: "0" }}>
          <img src="/logo.png" alt="DT Infinity Logo" style={{ height: "36px", objectFit: "contain" }} />
        </div>

        <nav className="nav">
          <div className="nav-label">Overview</div>
          <button 
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`} 
            onClick={() => setActiveView("dashboard")}
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
            onClick={() => setActiveView("network")}
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
            onClick={() => setActiveView("history")}
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
            onClick={() => setActiveView("deposit")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 4v16M4 12h16"/>
            </svg>
            New Deposit
          </button>
          <button 
            className={`nav-item ${activeView === "withdraw" ? "active" : ""}`} 
            onClick={() => setActiveView("withdraw")}
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
            onClick={() => setActiveView("profile")}
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
          <div>
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

          <div className="stat-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="card mini-card">
              <div className="k">Total Contract Available Balance</div>
              <div className="big mono" style={{ color: "var(--blue-bright)" }}>
                {contractUSDTBalance} <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
              </div>
              <div className="sub">Total liquidity locked inside main contract</div>
            </div>
            
            <div className="card mini-card">
              <div className="k">Total Withdraw Balance</div>
              <div className="big mono" style={{ color: "var(--up)" }}>
                {userData.totalWithdrawn} <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>USDT</span>
              </div>
              <div className="sub">Lifetime payouts withdrawn to your wallet</div>
            </div>
          </div>

          <div className="section-title">Income Capping Limits</div>
          <div className="two-col" style={{ gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "25px" }}>
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
                <span>Includes Daily ROI & Booster ROI</span>
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
                <span>Includes Level, Matching, Perf, & Reg Income</span>
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
                {(parseFloat(userData.dailyROIEarned) + parseFloat(pendingBalances.pendingDaily)).toFixed(2)}
              </div>
              <div className="rate">0.5% / day base</div>
            </div>

            <div className="income-card">
              <div className="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2l2.6 6.6L21 11l-6.4 2.4L12 20l-2.6-6.6L3 11l6.4-2.4z"/>
                </svg>
              </div>
              <div className="name">ROI Booster</div>
              <div className="amt mono">
                {(parseFloat(userData.roiBoosterEarned) + parseFloat(pendingBalances.pendingBooster)).toFixed(2)}
              </div>
              <div className="rate">Booster Rate: {userData.boosterRate}</div>
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
              <div className="amt mono">{userData.levelIncomeEarned}</div>
              <div className="rate">10 levels deep</div>
            </div>

            <div className="income-card">
              <div className="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4v16h16M8 15l3-3 3 2 5-6"/>
                </svg>
              </div>
              <div className="name">Level ROI</div>
              <div className="amt mono">{userData.levelROIEarned}</div>
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
                {(parseFloat(userData.performanceBonusEarned) + parseFloat(pendingBalances.pendingPerf)).toFixed(2)}
              </div>
              <div className="rate">Leg volume match</div>
            </div>

            <div className="income-card">
              <div className="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div className="name">Registration Income</div>
              <div className="amt mono">{userData.registrationIncomeEarned}</div>
              <div className="rate">5 levels deep</div>
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

          <div className="two-col" style={{ gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="section-title" style={{ marginTop: 0 }}>Interactive Network Tree</div>
              <p style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "20px" }}>
                Explore your hierarchical MLM tree. Click any node to load and expand its direct referrals. Click the crown icon to inspect the root.
              </p>
              
              <div className="tree-canvas-container" style={{ display: "flex", justifyContent: "center" }}>
                {treeRoot ? (
                  <TreeNodeComponent addr={treeRoot} depth={0} />
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
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Income Audits & Earnings Log</div>
            {txs.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "10px 0" }}>
                Connect wallet to check detailed historical referral earnings.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th style={{ textAlign: "right" }}>Commission (USDT)</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx, idx) => (
                    <tr key={idx}>
                      <td className="mono" style={{ color: "var(--text-muted)" }}>#{tx.blockNumber}</td>
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

          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Smart Contract Configurations (BNB Chain settings)</div>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: "1.6", marginBottom: "15px" }}>
              Paste your deployed Remix contract addresses below to sync your testing environment:
            </p>
            <div className="withdraw-card" style={{ gap: "15px" }}>
              <div>
                <div className="field">
                  <label>DT Infinity Contract Address</label>
                  <input 
                    type="text" 
                    value={dtInfinityAddress}
                    onChange={(e) => setDtInfinityAddress(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>USDT Token Contract Address</label>
                  <input 
                    type="text" 
                    value={usdtAddress}
                    onChange={(e) => setUsdtAddress(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Target Blockchain Network</label>
                  <select 
                    value={targetChainId.toString()} 
                    onChange={(e) => setTargetChainId(BigInt(e.target.value))}
                    style={{
                      width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px",
                      padding: "12px 14px", color: "var(--text)", fontSize: "13.5px", fontFamily: "inherit"
                    }}
                  >
                    <option value="97">BSC Testnet (Chain ID 97)</option>
                    <option value="56">BSC Mainnet (Chain ID 56)</option>
                  </select>
                </div>
                <button className="withdraw-btn" onClick={handleSaveConfig}>
                  Save & Reload Configurations
                </button>
              </div>
              <div className="avail-box">
                <div className="k">Current Configuration</div>
                <div style={{ marginTop: "10px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div><strong>DT Infinity:</strong> <span className="mono" style={{ color: "var(--blue-bright)" }}>{dtInfinityAddress}</span></div>
                  <div><strong>USDT Token:</strong> <span className="mono" style={{ color: "var(--blue-bright)" }}>{usdtAddress}</span></div>
                  <div><strong>Target Network:</strong> <span className="mono" style={{ color: "var(--blue-bright)" }}>{targetChainId === 97n ? "BSC Testnet" : "BSC Mainnet"}</span></div>
                </div>
                <button 
                  onClick={() => {
                    setDtInfinityAddress(DEFAULT_DT_INFINITY_ADDRESS);
                    setUsdtAddress(DEFAULT_USDT_ADDRESS);
                    setTargetChainId(97n);
                    localStorage.removeItem("DT_INFINITY_ADDRESS");
                    localStorage.removeItem("USDT_ADDRESS");
                    localStorage.removeItem("TARGET_CHAIN_ID");
                    alert("Reset to default test configurations.");
                  }} 
                  className="copy-btn" 
                  style={{ marginTop: "20px", padding: "8px" }}
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
