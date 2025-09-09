import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create and export the sql client
export const sql = neon(process.env.DATABASE_URL);

// Optional: Add connection pooling configuration for better performance
export const sqlConfig = {
  arrayMode: false,
  fullResults: false
};

// Database helper functions
export const dbHelpers = {
  /**
   * Test database connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await sql`SELECT NOW()`;
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  },

  /**
   * Get database version and basic info
   */
  async getInfo() {
    try {
      const [versionResult] = await sql`SELECT version()`;
      const [currentTimeResult] = await sql`SELECT NOW() as current_time`;
      
      return {
        version: versionResult!.version,
        currentTime: currentTimeResult!.current_time,
        status: 'connected'
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

// Export default for convenience
export default sql;
