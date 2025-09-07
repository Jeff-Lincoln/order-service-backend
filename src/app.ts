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


// import express from 'express';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import { sql } from './config/database.ts'; // Import your neon connection

// declare global {
//   var ordersCreatedTotal: number | undefined;
// }

// import { authRoutes } from './routes/auth.js';
// import { initializeOrderRoutes } from './routes/orders.js';
// import { initializePaymentRoutes } from './routes/payment.js';
// import { errorHandler } from './middleware/errorHandler.js';

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 3000;

// // Test database connection on startup
// async function initializeDatabase() {
//   try {
//     const result = await sql`SELECT NOW() as current_time`;
//     console.log('✅ Database connected successfully:', result[0]?.current_time);
//   } catch (error) {
//     console.error('❌ Database connection failed:', error);
//     process.exit(1); // Exit if database connection fails
//   }
// }

// // Initialize global counters
// global.ordersCreatedTotal = global.ordersCreatedTotal || 0;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Request logging middleware
// app.use((req, res, next) => {
//   console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
//   next();
// });

// // Routes - Pass the sql client instead of Pool
// app.use('/api/auth', authRoutes);
// app.use('/api/orders', initializeOrderRoutes(sql));
// app.use('/api/payments', initializePaymentRoutes(sql));

// // Metrics endpoint
// app.get('/metrics', (req, res) => {
//   res.json({
//     orders_created_total: global.ordersCreatedTotal || 0,
//     uptime_seconds: Math.floor(process.uptime()),
//     timestamp: new Date().toISOString()
//   });
// });

// // Health check route with database connectivity test
// app.get('/health', async (req, res) => {
//   try {
//     // Quick database health check
//     await sql`SELECT 1 as health_check`;
//     res.json({ 
//       status: 'OK', 
//       message: 'Server is running',
//       database: 'connected',
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     res.status(500).json({ 
//       status: 'ERROR', 
//       message: 'Database connection failed',
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// // 404 handler for unmatched routes
// app.use('*', (req, res) => {
//   res.status(404).json({ 
//     error: 'Route not found',
//     path: req.originalUrl,
//     method: req.method
//   });
// });

// // Error handling middleware (should be last)
// app.use(errorHandler);

// // Start server
// async function startServer() {
//   try {
//     await initializeDatabase();
    
//     app.listen(PORT, () => {
//       console.log(`🚀 Server running on port ${PORT}`);
//       console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
//       console.log('\n📋 Available endpoints:');
//       console.log('POST /api/auth/signup      - Create new user account');
//       console.log('POST /api/auth/login       - Login user');
//       console.log('POST /api/orders           - Create order');
//       console.log('GET  /api/orders           - List orders');
//       console.log('GET  /api/orders/:id       - Get order details');
//       console.log('PATCH /api/orders/:id/status - Update order status (ADMIN)');
//       console.log('POST /api/payments/initiate   - Initiate payment');
//       console.log('POST /api/payments/webhook    - Payment webhook');
//       console.log('GET  /metrics              - Application metrics');
//       console.log('GET  /health               - Health check');
//       console.log(`\n🔗 Base URL: http://localhost:${PORT}`);
//     });
//   } catch (error) {
//     console.error('Failed to start server:', error);
//     process.exit(1);
//   }
// }

// startServer();

// export default app;


// // // src/app.ts
// // import express from 'express';
// // import cors from 'cors';
// // import dotenv from 'dotenv';
// // import { authRoutes } from './routes/auth.js';
// // import { errorHandler } from './middleware/errorHandler.js';

// // dotenv.config();

// // const app = express();
// // const PORT = process.env.PORT || 3000;

// // // Middleware
// // app.use(cors());
// // app.use(express.json());

// // // Routes
// // app.use('/api/auth', authRoutes);

// // // Health check route
// // app.get('/health', (req, res) => {
// //   res.json({ status: 'OK', message: 'Server is running' });
// // });

// // // Error handling middleware (should be last)
// // app.use(errorHandler);

// // app.listen(PORT, () => {
// //   console.log(`Server running on port ${PORT}`);
// //   console.log('\nAvailable endpoints:');
// //   console.log('POST /api/auth/signup - Create new user account');
// //   console.log('POST /api/auth/login  - Login user');
// //   console.log('GET  /health         - Health check');
// // });

// // export default app;

// // // require("dotenv").config();
// // // const http = require("http");
// // // const url = require("url");
// // // const { neon } = require("@neondatabase/serverless");

// // // const sql = neon(process.env.DATABASE_URL);

// // // const requestHandler = async (req: any, res: any) => {
// // //   const parsedUrl = url.parse(req.url, true);
// // //   const path = parsedUrl.pathname;
// // //   const method = req.method;

// // //   // Set CORS headers
// // //   res.setHeader('Access-Control-Allow-Origin', '*');
// // //   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
// // //   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

// // //   try {
// // //     if (path === "/" && method === "GET") {
// // //       // Test database connection
// // //       const result = await sql`SELECT version()`;
// // //       const { version } = result[0];
// // //       res.writeHead(200, { "Content-Type": "text/plain" });
// // //       res.end(`Database connected! PostgreSQL version: ${version}`);
      
// // //     } else if (path === "/users" && method === "GET") {
// // //       // Fetch all users
// // //       const users = await sql`
// // //         SELECT id, email, role, created_at 
// // //         FROM users 
// // //         ORDER BY created_at DESC
// // //       `;
      
// // //       res.writeHead(200, { "Content-Type": "application/json" });
// // //       res.end(JSON.stringify({
// // //         success: true,
// // //         count: users.length,
// // //         users: users
// // //       }, null, 2));
      
// // //     } else if (path === "/users/create-dummy" && method === "POST") {
// // //       // Create some dummy users for testing
// // //       const dummyUsers = [
// // //         { email: 'john.doe@example.com', password_hash: 'hashed_password_1', role: 'USER' },
// // //         { email: 'jane.smith@example.com', password_hash: 'hashed_password_2', role: 'ADMIN' },
// // //         { email: 'bob.wilson@example.com', password_hash: 'hashed_password_3', role: 'USER' },
// // //         { email: 'alice.johnson@example.com', password_hash: 'hashed_password_4', role: 'USER' }
// // //       ];

// // //       const insertPromises = dummyUsers.map(user => 
// // //         sql`
// // //           INSERT INTO users (email, password_hash, role) 
// // //           VALUES (${user.email}, ${user.password_hash}, ${user.role})
// // //           ON CONFLICT (email) DO NOTHING
// // //           RETURNING id, email, role, created_at
// // //         `
// // //       );

// // //       const results = await Promise.all(insertPromises);
// // //       const createdUsers = results.filter(result => result.length > 0).map(result => result[0]);
      
// // //       res.writeHead(200, { "Content-Type": "application/json" });
// // //       res.end(JSON.stringify({
// // //         success: true,
// // //         message: `Created ${createdUsers.length} new dummy users`,
// // //         users: createdUsers
// // //       }, null, 2));
      
// // //     } else if (path.startsWith("/users/") && method === "GET") {
// // //       // Get user by ID
// // //       const userId = path.split("/")[2];
// // //       const userResult = await sql`
// // //         SELECT id, email, role, created_at 
// // //         FROM users 
// // //         WHERE id = ${userId}
// // //       `;
      
// // //       if (userResult.length === 0) {
// // //         res.writeHead(404, { "Content-Type": "application/json" });
// // //         res.end(JSON.stringify({ success: false, message: "User not found" }));
// // //         return;
// // //       }
      
// // //       res.writeHead(200, { "Content-Type": "application/json" });
// // //       res.end(JSON.stringify({
// // //         success: true,
// // //         user: userResult[0]
// // //       }, null, 2));
      
// // //     } else {
// // //       // 404 for unknown routes
// // //       res.writeHead(404, { "Content-Type": "application/json" });
// // //       res.end(JSON.stringify({ 
// // //         success: false, 
// // //         message: "Route not found",
// // //         availableRoutes: [
// // //           "GET / - Test database connection",
// // //           "GET /users - Fetch all users",
// // //           "GET /users/:id - Fetch user by ID",
// // //           "POST /users/create-dummy - Create dummy users"
// // //         ]
// // //       }, null, 2));
// // //     }
    
// // //   } catch (error: any) {
// // //     console.error("Database error:", error);
// // //     res.writeHead(500, { "Content-Type": "application/json" });
// // //     res.end(JSON.stringify({
// // //       success: false,
// // //       error: "Database error occurred",
// // //       details: error.message
// // //     }, null, 2));
// // //   }
// // // };

// // // const server = http.createServer(requestHandler);

// // // server.listen(3000, () => {
// // //   console.log("Server running at http://localhost:3000");
// // //   console.log("\nAvailable endpoints:");
// // //   console.log("GET  /               - Test database connection");
// // //   console.log("GET  /users          - Fetch all users");
// // //   console.log("GET  /users/:id      - Fetch user by ID");
// // //   console.log("POST /users/create-dummy - Create dummy users");
// // // });

// // // // Graceful shutdown
// // // process.on('SIGINT', () => {
// // //   console.log('\nShutting down server...');
// // //   server.close(() => {
// // //     console.log('Server closed');
// // //     process.exit(0);
// // //   });
// // // });


// // // // require("dotenv").config();

// // // // const http = require("http");
// // // // const { neon } = require("@neondatabase/serverless");

// // // // const sql = neon(process.env.DATABASE_URL);

// // // // const requestHandler = async (req: any, res: any) => {
// // // //   const result = await sql`SELECT version()`;
// // // //   const { version } = result[0];
// // // //   res.writeHead(200, { "Content-Type": "text/plain" });
// // // //   res.end(version);
// // // // };

// // // // http.createServer(requestHandler).listen(3000, () => {
// // // //   console.log("Server running at http://localhost:3000");
// // // // });