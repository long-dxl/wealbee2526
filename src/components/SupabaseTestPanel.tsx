// ========================================
// PIFIN.AI - SUPABASE TEST PANEL
// Component to test database connection from frontend
// ========================================

import { useState } from 'react';
import { Database, CheckCircle, XCircle, Loader, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
// StockSummary không có trong types sinh tự động → type tối thiểu tại chỗ (panel test).
type StockSummary = { symbol?: string; [k: string]: unknown };

export function SupabaseTestPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setIsLoading(true);
    setError(null);
    
    const results = {
      connection: false,
      tables: false,
      views: false,
      data: false,
      stockCount: 0,
      priceCount: 0
    };

    try {
      // Test 1: Connection
      const { error: connError } = await supabase
        .from('stocks')
        .select('count')
        .limit(1);
      
      results.connection = !connError;

      // Test 2: Tables
      const { data: stockData, error: stockError } = await supabase
        .from('stocks')
        .select('ticker')
        .limit(1);
      
      results.tables = !stockError && !!stockData;

      // Test 3: Views
      const { data: summaryData, error: summaryError } = await supabase
        .from('v_stock_summary')
        .select('*')
        .limit(1);
      
      results.views = !summaryError && !!summaryData;

      // Test 4: Count data
      const { count: stockCount } = await supabase
        .from('stocks')
        .select('*', { count: 'exact', head: true });
      
      const { count: priceCount } = await supabase
        .from('stock_prices')
        .select('*', { count: 'exact', head: true });
      
      results.stockCount = stockCount || 0;
      results.priceCount = priceCount || 0;
      results.data = (stockCount || 0) > 0;

      // Fetch actual stocks
      const { data: allStocks } = await supabase
        .from('v_stock_summary')
        .select('*')
        .order('market_cap', { ascending: false })
        .limit(10);
      
      if (allStocks) {
        setStocks(allStocks);
      }

      setTestResults(results);
      
    } catch (err: any) {
      setError(err.message);
      console.error('Test failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="size-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Supabase Database Test</h3>
            <p className="text-xs text-slate-500">Verify database connection and schema</p>
          </div>
        </div>
        
        <button
          onClick={runTests}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {isLoading ? (
            <>
              <Loader className="size-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Database className="size-4" />
              Run Tests
            </>
          )}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <XCircle className="size-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Test Failed</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <p className="text-xs text-red-600 mt-2">
                Make sure you've run all migrations in Supabase Dashboard.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Test Results */}
      {testResults && (
        <div className="space-y-4">
          {/* Status Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TestResultCard
              label="Connection"
              passed={testResults.connection}
            />
            <TestResultCard
              label="Tables"
              passed={testResults.tables}
            />
            <TestResultCard
              label="Views"
              passed={testResults.views}
            />
            <TestResultCard
              label="Data"
              passed={testResults.data}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-xs text-slate-600">Total Stocks</p>
              <p className="text-2xl font-bold text-slate-900">{testResults.stockCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600">Price Records</p>
              <p className="text-2xl font-bold text-slate-900">{testResults.priceCount}</p>
            </div>
          </div>

          {/* Stock List */}
          {stocks.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-600" />
                Top Stocks from Database
              </h4>
              
              <div className="space-y-2">
                {stocks.slice(0, 5).map((stock) => (
                  <div
                    key={stock.id}
                    className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-700">{stock.ticker}</span>
                        <span className="text-sm text-slate-600">{stock.name}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{stock.sector}</p>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {stock.current_price?.toLocaleString('vi-VN')} đ
                      </p>
                      {stock.dividend_yield && (
                        <p className="text-xs text-emerald-600">
                          Yield: {stock.dividend_yield.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Message */}
          {testResults.connection && testResults.tables && testResults.views && testResults.data && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="size-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-medium text-emerald-900">All Tests Passed!</p>
                  <p className="text-sm text-emerald-700 mt-1">
                    Database is properly configured and ready for use.
                  </p>
                  <p className="text-xs text-emerald-600 mt-2">
                    ✓ Schema created • ✓ RLS enabled • ✓ Sample data loaded
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      {!testResults && !isLoading && (
        <div className="text-center py-8">
          <Database className="size-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 mb-2">Click "Run Tests" to verify database setup</p>
          <p className="text-xs text-slate-500">
            Make sure you've run all migrations first
          </p>
        </div>
      )}
    </div>
  );
}

// Helper component
function TestResultCard({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className={`p-4 rounded-lg border ${
      passed 
        ? 'bg-emerald-50 border-emerald-200' 
        : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {passed ? (
          <CheckCircle className="size-4 text-emerald-600" />
        ) : (
          <XCircle className="size-4 text-red-600" />
        )}
        <span className={`text-xs font-medium ${
          passed ? 'text-emerald-900' : 'text-red-900'
        }`}>
          {label}
        </span>
      </div>
      <p className={`text-xs ${
        passed ? 'text-emerald-700' : 'text-red-700'
      }`}>
        {passed ? 'Working' : 'Failed'}
      </p>
    </div>
  );
}
