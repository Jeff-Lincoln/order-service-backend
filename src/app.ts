require("dotenv").config();
const http = require("http");
const url = require("url");
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

const requestHandler = async (req: any, res: any) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    if (path === "/" && method === "GET") {
      // Test database connection
      const result = await sql`SELECT version()`;
      const { version } = result[0];
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`Database connected! PostgreSQL version: ${version}`);
      
    } else if (path === "/users" && method === "GET") {
      // Fetch all users
      const users = await sql`
        SELECT id, email, role, created_at 
        FROM users 
        ORDER BY created_at DESC
      `;
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        count: users.length,
        users: users
      }, null, 2));
      
    } else if (path === "/users/create-dummy" && method === "POST") {
      // Create some dummy users for testing
      const dummyUsers = [
        { email: 'john.doe@example.com', password_hash: 'hashed_password_1', role: 'USER' },
        { email: 'jane.smith@example.com', password_hash: 'hashed_password_2', role: 'ADMIN' },
        { email: 'bob.wilson@example.com', password_hash: 'hashed_password_3', role: 'USER' },
        { email: 'alice.johnson@example.com', password_hash: 'hashed_password_4', role: 'USER' }
      ];

      const insertPromises = dummyUsers.map(user => 
        sql`
          INSERT INTO users (email, password_hash, role) 
          VALUES (${user.email}, ${user.password_hash}, ${user.role})
          ON CONFLICT (email) DO NOTHING
          RETURNING id, email, role, created_at
        `
      );

      const results = await Promise.all(insertPromises);
      const createdUsers = results.filter(result => result.length > 0).map(result => result[0]);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: `Created ${createdUsers.length} new dummy users`,
        users: createdUsers
      }, null, 2));
      
    } else if (path.startsWith("/users/") && method === "GET") {
      // Get user by ID
      const userId = path.split("/")[2];
      const userResult = await sql`
        SELECT id, email, role, created_at 
        FROM users 
        WHERE id = ${userId}
      `;
      
      if (userResult.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: "User not found" }));
        return;
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        user: userResult[0]
      }, null, 2));
      
    } else {
      // 404 for unknown routes
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        success: false, 
        message: "Route not found",
        availableRoutes: [
          "GET / - Test database connection",
          "GET /users - Fetch all users",
          "GET /users/:id - Fetch user by ID",
          "POST /users/create-dummy - Create dummy users"
        ]
      }, null, 2));
    }
    
  } catch (error: any) {
    console.error("Database error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: false,
      error: "Database error occurred",
      details: error.message
    }, null, 2));
  }
};

const server = http.createServer(requestHandler);

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
  console.log("\nAvailable endpoints:");
  console.log("GET  /               - Test database connection");
  console.log("GET  /users          - Fetch all users");
  console.log("GET  /users/:id      - Fetch user by ID");
  console.log("POST /users/create-dummy - Create dummy users");
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});


// require("dotenv").config();

// const http = require("http");
// const { neon } = require("@neondatabase/serverless");

// const sql = neon(process.env.DATABASE_URL);

// const requestHandler = async (req: any, res: any) => {
//   const result = await sql`SELECT version()`;
//   const { version } = result[0];
//   res.writeHead(200, { "Content-Type": "text/plain" });
//   res.end(version);
// };

// http.createServer(requestHandler).listen(3000, () => {
//   console.log("Server running at http://localhost:3000");
// });