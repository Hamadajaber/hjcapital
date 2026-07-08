export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Capital.com API credentials
  capitalApiKey: process.env.CAPITAL_COM_API_KEY ?? "",
  capitalEmail: process.env.CAPITAL_COM_EMAIL ?? "",
  capitalPassword: process.env.CAPITAL_COM_PASSWORD ?? "",
  // Binance API credentials (optional — can also be stored encrypted in DB)
  binanceApiKey: process.env.BINANCE_API_KEY ?? "",
  binanceApiSecret: process.env.BINANCE_API_SECRET ?? "",
  binanceTestnet: process.env.BINANCE_TESTNET === "true",
  // Active broker: 'capitalcom' | 'binance' | 'both' (default: capitalcom)
  activeBroker: (process.env.ACTIVE_BROKER ?? "capitalcom") as "capitalcom" | "binance" | "both",
  // TradingAgents-inspired multi-agent pipeline (off | light | full)
  agentPipelineMode: process.env.HJ_AGENT_PIPELINE_MODE ?? "off",
};
