// src/config.ts
export const mcpConfig = {
  defaultWsPort: 9002,
};

export const appConfig = {
  name: "@browsermcp/mcp", // Matches the package.json name
};

export const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
