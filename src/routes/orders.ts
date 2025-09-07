import { Router } from 'express';
import { OrderService } from '../services/orderService.js';
import { authenticate, authorize, type AuthenticatedRequest } from '../middleware/auth.js';
import { UserRole, OrderStatus } from '../models/Order.js';
import { orderCreationLimiter } from '../middleware/ratelimiter.js';
import { body, query, param, validationResult } from 'express-validator';
import { cacheService } from '../services/cacheService.js';
import { sql } from '../config/database.ts';

const router = Router();

// Validation middleware
const createOrderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Items must be a non-empty array'),
  body('items.*.sku').isString().notEmpty().withMessage('SKU is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
  body('items.*.price').isInt({ min: 0 }).withMessage('Price must be non-negative'),
  body('client_token').isString().notEmpty().withMessage('Client token is required')
];

const updateStatusValidation = [
  param('id').isUUID().withMessage('Invalid order ID'),
  body('status').isIn(['PENDING', 'PAID', 'CANCELLED']).withMessage('Invalid status'),
  body('version').optional().isInt().withMessage('Version must be an integer')
];

const listOrdersValidation = [
  query('status').optional().isIn(['PENDING', 'PAID', 'CANCELLED']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('q').optional().isString()
];

// Initialize service
let orderService: OrderService;

export const initializeOrderRoutes = (dbClient: typeof sql) => {
  orderService = new OrderService(dbClient);
  return router;
};

// POST /orders - Create order
router.post('/', 
  orderCreationLimiter,
  authenticate, 
  createOrderValidation,
  async (req: AuthenticatedRequest, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { items, client_token } = req.body;
      const order = await orderService.createOrder(req.user!.id, items, client_token);
      
      res.status(201).json(order);
    } catch (error: any) {
      // Check for unique constraint violation (idempotency)
      if (error.message && error.message.includes('duplicate key') && error.message.includes('client_token')) {
        // Return existing order
        try {
          const existingOrders = await orderService.getOrders(req.user!.id, req.user!.role);
          const existing = existingOrders.orders.find(o => o.client_token === req.body.client_token);
          if (existing) {
            return res.json(existing);
          }
        } catch (fetchError) {
          console.error('Error fetching existing order:', fetchError);
        }
      }
      
      console.error('Order creation error:', error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  }
);

// GET /orders - List orders
router.get('/',
  authenticate,
  listOrdersValidation,
  async (req: AuthenticatedRequest, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { status, q: searchSku, page = '1', limit = '10' } = req.query;
      
      const result = await orderService.getOrders(
        req.user!.id,
        req.user!.role,
        status as OrderStatus,
        searchSku as string,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.json({
        orders: result.orders,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: result.total,
          pages: Math.ceil(result.total / parseInt(limit as string))
        }
      });
    } catch (error) {
      console.error('List orders error:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }
);

// GET /orders/:id - Get order details (with caching)
router.get('/:id',
  authenticate,
  param('id').isUUID(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const cacheKey = `order:${id}:${req.user!.role === 'ADMIN' ? 'admin' : req.user!.id}`;
      
      // Try cache first
      let order = cacheService.get(cacheKey);
      
      if (!order) {
        order = await orderService.getOrderById(id!, req.user!.id, req.user!.role);
        if (order) {
          cacheService.set(cacheKey, order, 30000); // 30 seconds
        }
      }

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }
);

// PATCH /orders/:id/status - Update order status (ADMIN only)
router.patch('/:id/status',
  authenticate,
  authorize([UserRole.ADMIN]),
  updateStatusValidation,
  async (req: AuthenticatedRequest, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { status, version } = req.body;

      const order = await orderService.updateOrderStatus(id!, status, version);
      
      res.json(order);
    } catch (error: any) {
      console.error('Update order status error:', error);
      
      if (error.message.includes('modified by another process')) {
        return res.status(409).json({ error: error.message });
      }
      
      if (error.message === 'Order not found') {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }
);

export { router as orderRoutes };