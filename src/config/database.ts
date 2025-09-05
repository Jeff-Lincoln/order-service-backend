import { neon } from '@neondatabase/serverless';
import 'dotenv/config';


if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}


export const sql = neon(process.env.DATABASE_URL);

async function testConnection() {
  try {
    const result = await sql`SELECT NOW()`;
    console.log('Database connected successfully:', result);
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

testConnection();