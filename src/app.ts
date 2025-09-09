import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// Import your neon connection
import { sql } from './config/database.ts';

declare global {
  var ordersCreatedTotal: number | undefined;
}

import { authRoutes } from './routes/auth.js';
import { initializeOrderRoutes } from './routes/orders.js';
import { initializePaymentRoutes } from './routes/payment.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Test database connection on startup
async function initializeDatabase() {
  try {
    const result = await sql`SELECT NOW() as current_time`;
    console.log('✅ Database connected successfully:', result[0]?.current_time);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1); // Exit if database connection fails
  }
}

// Initialize global counters
global.ordersCreatedTotal = global.ordersCreatedTotal || 0;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Routes - Pass the sql client instead of Pool
app.use('/api/auth', authRoutes);
app.use('/api/orders', initializeOrderRoutes(sql));
app.use('/api/payments', initializePaymentRoutes(sql));

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    orders_created_total: global.ordersCreatedTotal || 0,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Health check route with database connectivity test
app.get('/health', async (req, res) => {
  try {
    // Quick database health check
    await sql`SELECT 1 as health_check`;
    res.json({ 
      status: 'OK', 
      message: 'Server is running',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// // 404 handler for unmatched routes
// app.all('*', (req, res) => {
//   res.status(404).json({ 
//     error: 'Route not found',
//     path: req.originalUrl,
//     method: req.method
//   });
// });

// // Error handling middleware (should be last)
// app.use(errorHandler);

// // 404 handler for unmatched routes (FIXED)
// app.all('*', (req, res) => {
//   res.status(404).json({ 
//     error: 'Route not found',
//     path: req.originalUrl,
//     method: req.method,
//     availableEndpoints: [
//       'GET /',
//       'GET /health',
//       'GET /metrics', 
//       'GET /test-models'
//     ]
//   });
// });

// // Error handling middleware
// app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
//   console.error('Error:', error);
//   res.status(500).json({
//     error: 'Internal server error',
//     message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
//   });
// });

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('\n📋 Available endpoints:');
      console.log('POST /api/auth/signup      - Create new user account');
      console.log('POST /api/auth/login       - Login user');
      console.log('POST /api/orders           - Create order');
      console.log('GET  /api/orders           - List orders');
      console.log('GET  /api/orders/:id       - Get order details');
      console.log('PATCH /api/orders/:id/status - Update order status (ADMIN)');
      console.log('POST /api/payments/initiate   - Initiate payment');
      console.log('POST /api/payments/webhook    - Payment webhook');
      console.log('GET  /metrics              - Application metrics');
      console.log('GET  /health               - Health check');
      console.log(`\n🔗 Base URL: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;

