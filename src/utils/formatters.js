import { ethers } from "ethers";

export const formatCountdown = (secs) => {
  if (secs <= 0) return "00:00:00";
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;

  const pad = (num) => String(num).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

export const formatTxAmount = (amt) => {
  if (amt === undefined || amt === null) return "0";
  const num = typeof amt === "number" ? amt : parseFloat(amt);
  if (isNaN(num)) return "0";
  const rounded = Math.round(num * 1e6) / 1e6;
  return parseFloat(rounded.toFixed(4)).toString();
};

export function shorten(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "None";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function formatUSDT(bigIntVal) {
  if (!bigIntVal) return "0.00";
  return parseFloat(ethers.formatUnits(bigIntVal, 18)).toFixed(2);
}

export function safeFloat(val) {
  if (val === undefined || val === null) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}
