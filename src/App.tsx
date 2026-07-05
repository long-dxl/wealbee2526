import { RouterProvider } from 'react-router';
import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes.tsx';
import { ErrorBoundary } from './components/error-boundary';
import { AuthProvider } from './lib/auth-context';
import { queryClient } from './lib/query-client';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}