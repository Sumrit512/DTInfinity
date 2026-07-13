import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    contractAddress: v.optional(v.string()), // optional for legacy dev data compatibility
    address: v.string(), // lowercase wallet address
    sponsor: v.string(), // lowercase sponsor address
    totalDeposits: v.number(),
    registrationTime: v.number(),
    lastUpdateROI: v.number(),
    claimableBalance: v.number(),
    totalWithdrawn: v.number(),
    directCount: v.number(),
    qualifiedDirectsCount: v.number(),
    totalTeamCount: v.number(),
    totalTeamVolume: v.number(),
    strongestLegAddress: v.string(),
    strongestLegVolume: v.number(),
    boosterRate: v.number(),
    lastSynced: v.number(),
  }).index("by_contract_address_address", ["contractAddress", "address"])
    .index("by_address", ["address"]),

  deposits: defineTable({
    contractAddress: v.optional(v.string()),
    user: v.string(), // lowercase user wallet
    amount: v.number(),
    time: v.number(),
    txHash: v.string(), // unique key: "0x_dep_user_index"
    actualTxHash: v.optional(v.string()), // actual blockchain transaction hash
  }).index("by_contract_address_user", ["contractAddress", "user"])
    .index("by_txHash", ["txHash"])
    .index("by_actualTxHash", ["actualTxHash"]),

  withdrawals: defineTable({
    contractAddress: v.optional(v.string()),
    user: v.string(), // lowercase user wallet
    amount: v.number(),
    time: v.number(),
    txHash: v.string(), // unique key: "0x_with_user_index"
    actualTxHash: v.optional(v.string()), // actual blockchain transaction hash
  }).index("by_contract_address_user", ["contractAddress", "user"])
    .index("by_txHash", ["txHash"])
    .index("by_actualTxHash", ["actualTxHash"]),

  referrals: defineTable({
    contractAddress: v.optional(v.string()),
    sponsor: v.string(), // lowercase sponsor wallet
    referral: v.string(), // lowercase referral wallet
  }).index("by_contract_address_sponsor", ["contractAddress", "sponsor"])
    .index("by_contract_address_referral", ["contractAddress", "referral"])
    .index("by_sponsor", ["sponsor"])
    .index("by_referral", ["referral"]),

  onChainEvents: defineTable({
    contractAddress: v.optional(v.string()),
    user: v.string(), // lowercase user wallet
    type: v.string(),
    typeName: v.string(),
    fromUser: v.string(),
    amount: v.number(),
    level: v.string(),
    timestamp: v.number(),
    status: v.string(),
    txHash: v.string(),
    blockNumber: v.number(),
    isSimulated: v.boolean(),
    tierIndex: v.optional(v.number()),
  }).index("by_contract_address_user_time", ["contractAddress", "user", "timestamp"])
    .index("by_txHash", ["txHash"]),
});
