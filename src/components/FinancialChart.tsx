import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LabelList, Cell } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

type ChartDataPoint = {
  year: string;
  value: number;
  yoyGrowth?: number;
  isForecast?: boolean;
  isLTM?: boolean;
};

type FinancialChartProps = {
  title: string;
  data: ChartDataPoint[];
  caption?: string;
  formatter?: (value: number) => string;
  thresholdLine?: {
    value: number;
    label: string;
    color?: string;
  };
  colorLogic?: (value: number, dataPoint: ChartDataPoint) => string;
  unit?: string;
};

export function FinancialChart({
  title,
  data,
  caption,
  formatter = (value) => value.toLocaleString('vi-VN'),
  thresholdLine,
  colorLogic,
  unit = ''
}: FinancialChartProps) {
  
  // Default color logic: Emerald for positive, Red for negative
  const getBarColor = (value: number, dataPoint: ChartDataPoint) => {
    if (colorLogic) {
      return colorLogic(value, dataPoint);
    }
    // Default: Forecast is lighter, LTM is darker
    if (dataPoint.isForecast) return '#93c5fd'; // Light blue for forecast
    if (dataPoint.isLTM) return '#1e40af'; // Dark blue for LTM
    return '#3b82f6'; // Default blue
  };

  // Format label for display on top of bars (compact format)
  const formatLabel = (value: number) => {
    // For percentages
    if (unit === '%') {
      return `${value.toFixed(0)}%`;
    }
    
    // For VND (billions)
    if (unit === 'VNĐ') {
      if (value >= 10000) return `${(value / 1000).toFixed(1)}B`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}B`;
      return value.toFixed(0);
    }
    
    // For currency (đ/CP)
    if (unit === 'đ/CP') {
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toFixed(0);
    }
    
    // For shares (millions)
    if (unit === 'triệu CP') {
      return `${value.toFixed(0)}M`;
    }
    
    // Default formatting
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  // Custom Label Component for better control
  const CustomLabel = (props: any) => {
    const { x, y, width, value, index } = props;
    const dataPoint = data[index];
    
    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill={dataPoint.isForecast ? '#94a3b8' : '#475569'}
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
      >
        {formatLabel(value)}
      </text>
    );
  };

  // Custom Tooltip Component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const value = payload[0].value;
      const yoyGrowth = dataPoint.yoyGrowth;

      return (
        <div className="bg-white px-4 py-3 rounded-lg shadow-lg border border-slate-200">
          <p className="text-sm font-semibold text-slate-900 mb-1">
            {dataPoint.year}
            {dataPoint.isLTM && <span className="ml-1 text-xs text-blue-600">(LTM)</span>}
            {dataPoint.isForecast && <span className="ml-1 text-xs text-slate-500">(Dự báo)</span>}
          </p>
          <p className="text-base font-bold text-slate-900 mb-2">
            {formatter(value)} {unit}
          </p>
          
          {yoyGrowth !== undefined && yoyGrowth !== null && (
            <div className={`flex items-center gap-1 text-xs font-medium ${
              yoyGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {yoyGrowth >= 0 ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              <span>{yoyGrowth >= 0 ? '+' : ''}{yoyGrowth.toFixed(1)}% YoY</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
        {caption && (
          <p className="text-xs text-slate-500">{caption}</p>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart 
          data={data} 
          margin={{ top: 30, right: 15, left: 0, bottom: 5 }}
          barSize={50}
          barGap={8}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis 
            dataKey="year" 
            tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            height={50}
          />
          <YAxis 
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={45}
            tickFormatter={(value) => {
              if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
              return value.toString();
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', opacity: 0.5 }} />
          
          {/* Threshold Line (if provided) */}
          {thresholdLine && (
            <ReferenceLine 
              y={thresholdLine.value} 
              stroke={thresholdLine.color || '#64748b'}
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{ 
                value: thresholdLine.label, 
                position: 'insideTopRight', 
                fontSize: 11, 
                fill: '#64748b',
                fontWeight: 600,
                offset: 10
              }}
            />
          )}
          
          {/* Bar with dynamic colors using Cell */}
          <Bar 
            dataKey="value" 
            radius={[8, 8, 0, 0]}
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`}
                fill={getBarColor(entry.value, entry)}
                opacity={entry.isForecast ? 0.7 : 1}
                strokeWidth={entry.isForecast ? 2 : 0}
                stroke={entry.isForecast ? getBarColor(entry.value, entry) : 'none'}
                strokeDasharray={entry.isForecast ? '4 2' : '0'}
              />
            ))}
            {/* Data Labels on top of bars */}
            <LabelList content={<CustomLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
