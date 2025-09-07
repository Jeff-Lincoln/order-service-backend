import { OrderStatus, type Order, type OrderItem } from '../models/Order.js';
import { v4 as uuidv4 } from 'uuid';
import { sql } from '../config/database.ts';

declare global {
  var orderCache: { [key: string]: Order } | undefined;
  var ordersCreatedTotal: number | undefined;
}

export class OrderService {
  constructor(private db: typeof sql) {}

  async createOrder(userId: string, items: OrderItem[], clientToken: string): Promise<Order> {
    try {
      // Check for existing order with same client_token (idempotency)
      const existingResult = await this.db`
        SELECT * FROM orders WHERE client_token = ${clientToken}
      `;
      
      if (existingResult.length > 0) {
        return this.mapRowToOrder(existingResult[0]);
      }

      // Calculate total amount
      const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Create new order
      const result = await this.db`
        INSERT INTO orders (user_id, items, client_token, total_amount, status, version, created_at, updated_at) 
        VALUES (${userId}, ${JSON.stringify(items)}, ${clientToken}, ${totalAmount}, 'PENDING', 1, NOW(), NOW()) 
        RETURNING *
      `;

      // Increment metrics
      this.incrementOrdersCreated();
      
      return this.mapRowToOrder(result[0]);
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  async getOrders(
    userId?: string, 
    role?: string,
    status?: OrderStatus,
    searchSku?: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ orders: Order[], total: number }> {
    try {
      let whereConditions: string[] = ['1=1'];
      let params: any = {};
      
      // RBAC: Users can only see their own orders, admins see all
      if (role !== 'ADMIN' && userId) {
        whereConditions.push('user_id = $userId');
        params.userId = userId;
      }

      if (status) {
        whereConditions.push('status = $status');
        params.status = status;
      }

      if (searchSku) {
        whereConditions.push('items::text ILIKE $searchSku');
        params.searchSku = `%${searchSku}%`;
      }

      const whereClause = whereConditions.join(' AND ');

      // Count total - we'll build the query dynamically
      let countQuery = `SELECT COUNT(*) as count FROM orders WHERE ${whereClause}`;
      
      // Get total count first
      let totalResult: any[];
      if (role !== 'ADMIN' && userId) {
        if (status && searchSku) {
          totalResult = await this.db`
            SELECT COUNT(*) as count FROM orders 
            WHERE user_id = ${userId} AND status = ${status} AND items::text ILIKE ${`%${searchSku}%`}
          `;
        } else if (status) {
          totalResult = await this.db`
            SELECT COUNT(*) as count FROM orders 
            WHERE user_id = ${userId} AND status = ${status}
          `;
        } else if (searchSku) {
          totalResult = await this.db`
            SELECT COUNT(*) as count FROM orders 
            WHERE user_id = ${userId} AND items::text ILIKE ${`%${searchSku}%`}
          `;
        } else {
          totalResult = await this.db`
            SELECT COUNT(*) as count FROM orders 
            WHERE user_id = ${userId}
          `;
        }
      } else {
        // Admin can see all orders
        if (status && searchSku) {
          totalResult = await this.db`
            SELECT COUNT(*) as count FROM orders 
            WHERE status = ${status} AND items::text ILIKE ${`%${searchSku}%`}
          `;
        } else if (status) {
          totalResult = await this.db`
            SELECT COUNT(*) as count FROM orders 
            WHERE status = ${status}
          `;
        } else if (searchSku) {
          totalResult = await this.db`
            SELECT COUNT(*) as count FROM orders 
            WHERE items::text ILIKE ${`%${searchSku}%`}
          `;
        } else {
          totalResult = await this.db`SELECT COUNT(*) as count FROM orders`;
        }
      }

      const total = parseInt(totalResult[0].count);

      // Get paginated results
      const offset = (page - 1) * limit;
      
      let ordersResult: any[];
      if (role !== 'ADMIN' && userId) {
        if (status && searchSku) {
          ordersResult = await this.db`
            SELECT * FROM orders 
            WHERE user_id = ${userId} AND status = ${status} AND items::text ILIKE ${`%${searchSku}%`}
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else if (status) {
          ordersResult = await this.db`
            SELECT * FROM orders 
            WHERE user_id = ${userId} AND status = ${status}
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else if (searchSku) {
          ordersResult = await this.db`
            SELECT * FROM orders 
            WHERE user_id = ${userId} AND items::text ILIKE ${`%${searchSku}%`}
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else {
          ordersResult = await this.db`
            SELECT * FROM orders 
            WHERE user_id = ${userId}
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        }
      } else {
        // Admin queries
        if (status && searchSku) {
          ordersResult = await this.db`
            SELECT * FROM orders 
            WHERE status = ${status} AND items::text ILIKE ${`%${searchSku}%`}
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else if (status) {
          ordersResult = await this.db`
            SELECT * FROM orders 
            WHERE status = ${status}
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else if (searchSku) {
          ordersResult = await this.db`
            SELECT * FROM orders 
            WHERE items::text ILIKE ${`%${searchSku}%`}
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else {
          ordersResult = await this.db`
            SELECT * FROM orders 
            ORDER BY created_at DESC 
            LIMIT ${limit} OFFSET ${offset}
          `;
        }
      }

      const orders = ordersResult.map(row => this.mapRowToOrder(row));
      return { orders, total };

    } catch (error) {
      console.error('Error getting orders:', error);
      throw error;
    }
  }

  async getOrderById(orderId: string, userId?: string, role?: string): Promise<Order | null> {
    try {
      let result: any[];

      // RBAC: Users can only see their own orders
      if (role !== 'ADMIN' && userId) {
        result = await this.db`
          SELECT * FROM orders WHERE id = ${orderId} AND user_id = ${userId}
        `;
      } else {
        result = await this.db`
          SELECT * FROM orders WHERE id = ${orderId}
        `;
      }
      
      if (result.length === 0) {
        return null;
      }

      return this.mapRowToOrder(result[0]);
    } catch (error) {
      console.error('Error getting order by ID:', error);
      throw error;
    }
  }

  async updateOrderStatus(
    orderId: string, 
    newStatus: OrderStatus, 
    currentVersion?: number
  ): Promise<Order> {
    try {
      // Optimistic locking: check current version
      const currentResult = await this.db`
        SELECT * FROM orders WHERE id = ${orderId}
      `;

      if (currentResult.length === 0) {
        throw new Error('Order not found');
      }

      const currentOrder = currentResult[0];
      
      if (currentVersion && currentOrder?.version !== currentVersion) {
        throw new Error('Order was modified by another process. Please refresh and try again.');
      }

      // Update with version increment
      const result = await this.db`
        UPDATE orders 
        SET status = ${newStatus}, version = version + 1, updated_at = NOW() 
        WHERE id = ${orderId} 
        RETURNING *
      `;

      // Invalidate cache
      this.invalidateOrderCache(orderId);
      
      return this.mapRowToOrder(result[0]);
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  private mapRowToOrder(row: any): any {
    return {
      id: row.id,
      user_id: row.user_id,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      status: row.status,
      client_token: row.client_token,
      total_amount: parseFloat(row.total_amount),
      version: row.version,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  private incrementOrdersCreated() {
    // Simple in-memory counter for demo
    global.ordersCreatedTotal = (global.ordersCreatedTotal || 0) + 1;
    console.log(`Metric: orders_created_total = ${global.ordersCreatedTotal}`);
  }

  private invalidateOrderCache(orderId: string) {
    // Invalidate cache entry for this order
    if (global.orderCache) {
      delete global.orderCache[orderId];
    }
  }
}