// Color Logic Functions for FinancialChart bars
export const payoutRatioColorLogic = (value: number, dataPoint: any) => {
  // Forecast gets lighter shade
  if (dataPoint.isForecast) {
    if (value < 60) return '#93c5fd'; // Light blue
    if (value < 90) return '#fcd34d'; // Light yellow
    return '#fca5a5'; // Light red
  }
  
  // Normal coloring
  if (value < 60) return '#3b82f6'; // Blue (Safe)
  if (value < 90) return '#f59e0b'; // Yellow (Caution)
  return '#ef4444'; // Red (Danger)
};

export const sharesOutstandingColorLogic = (value: number, dataPoint: any) => {
  // Declining shares = Green (good for shareholders)
  // Increasing shares = Red (dilution)
  const yoyGrowth = dataPoint.yoyGrowth || 0;
  
  if (dataPoint.isForecast) {
    return yoyGrowth < 0 ? '#86efac' : '#fca5a5'; // Light shades
  }
  
  return yoyGrowth < 0 ? '#10b981' : '#ef4444'; // Normal
};

export const fcfColorLogic = (value: number, dataPoint: any) => {
  if (dataPoint.isForecast) return '#a78bfa'; // Light purple
  return '#8b5cf6'; // Purple
};

export const epsColorLogic = (value: number, dataPoint: any) => {
  if (dataPoint.isForecast) return '#93c5fd'; // Light blue
  return '#3b82f6'; // Blue
};

export const revenueColorLogic = (value: number, dataPoint: any) => {
  if (dataPoint.isForecast) return '#93c5fd'; // Light blue
  return '#3b82f6'; // Blue
};

export const netIncomeColorLogic = (value: number, dataPoint: any) => {
  if (dataPoint.isForecast) return '#86efac'; // Light emerald
  return '#10b981'; // Emerald
};