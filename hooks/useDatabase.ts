import { useState, useEffect } from 'react';
import { initializeDatabase } from '../services/database';

interface UseDatabaseResult {
  isReady: boolean;
  error: string | null;
}

/**
 * Hook to initialize the database on app start
 */
export function useDatabase(): UseDatabaseResult {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await initializeDatabase();
        setIsReady(true);
      } catch (err) {
        console.error('[useDatabase] Initialization failed:', err);
        setError(
          err instanceof Error ? err.message : 'Database initialization failed'
        );
      }
    };

    init();
  }, []);

  return { isReady, error };
}
