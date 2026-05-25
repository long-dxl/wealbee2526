// Mock platform types for portfolios and watchlists
// TODO: Replace with real Supabase data

export interface WatchlistItem {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface Portfolio {
  id: string;
  name: string;
  stocks: WatchlistItem[];
  createdAt: Date;
}

export const defaultPortfolios: Portfolio[] = [
  {
    id: "p1",
    name: "Danh mục chính",
    stocks: [
      { ticker: "VCB", price: 95800, change: 800, changePercent: 0.84 },
      { ticker: "FPT", price: 125600, change: 2100, changePercent: 1.70 },
      { ticker: "HPG", price: 27950, change: -350, changePercent: -1.24 },
    ],
    createdAt: new Date("2024-01-01"),
  },
];
