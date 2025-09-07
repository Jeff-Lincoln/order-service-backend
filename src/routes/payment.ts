import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.ts';
import crypto from 'crypto';
import { OrderService } from '../services/orderService.js';
import { sql } from '../config/database.js';

const paymentsRouter = Router();
let orderService: OrderService;

// Enhanced payment statuses
export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PROCESSING = 'PROCESSING'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export const initializePaymentRoutes = (dbClient: typeof sql) => {
  orderService = new OrderService(dbClient);
  return paymentsRouter;
};

// POST /payments/initiate
paymentsRouter.post('/initiate',
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { order_id, payment_method = 'MPESA', currency = 'KSHS' }= req.body;
      
      // Validate required fields
      if (!order_id) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          details: 'order_id is required'
        });
      }

      // Get order with validation
      const order = await orderService.getOrderById(order_id, req.user!.id, req.user!.role);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Check if order is already paid
      if (order.status === OrderStatus.PAID) {
        return res.status(400).json({ error: 'Order is already paid' });
      }

      // Check if there's already a pending payment for this order
      const existingPayment = await sql`
        SELECT payment_id, status, redirect_url 
        FROM payments 
        WHERE order_id = ${order_id} AND status = ${PaymentStatus.PENDING}
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      if (existingPayment.length > 0) {
        return res.json({
          payment_id: existingPayment[0]?.payment_id,
          redirect_url: existingPayment[0]?.redirect_url,
          amount: order.total_amount,
          currency,
          message: 'Using existing pending payment'
        });
      }

      // Create new payment record
      const paymentId = `pay_${crypto.randomBytes(16).toString('hex')}`;
      const redirectUrl = `${process.env.PAYMENT_PROVIDER_URL || 'https://payment-provider.example.com'}/pay/${paymentId}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await sql`
        INSERT INTO payments (
          order_id, 
          payment_id, 
          amount, 
          currency,
          payment_method,
          status, 
          redirect_url,
          expires_at,
          created_at,
          updated_at
        )
        VALUES (
          ${order_id}, 
          ${paymentId}, 
          ${order.total_amount}, 
          ${currency},
          ${payment_method},
          ${PaymentStatus.PENDING}, 
          ${redirectUrl},
          ${expiresAt},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `;

      res.json({
        payment_id: paymentId,
        redirect_url: redirectUrl,
        amount: order.total_amount,
        currency,
        expires_at: expiresAt,
        payment_method
      });

    } catch (error) {
      console.error('Payment initiation error:', error);
      res.status(500).json({ 
        error: 'Failed to initiate payment',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// GET /payments/:payment_id/status
paymentsRouter.get('/:payment_id/status',
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { payment_id } = req.params;

      const payment = await sql`
        SELECT p.*, o.user_id 
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE p.payment_id = ${payment_id}
      `;

      if (payment.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      // Check if user owns this payment (unless admin)
      if (req.user!.role !== 'ADMIN' && payment[0]?.user_id !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        payment_id: payment[0]?.payment_id,
        status: payment[0]?.status,
        amount: payment[0]?.amount,
        currency: payment[0]?.currency,
        created_at: payment[0]?.created_at,
        updated_at: payment[0]?.updated_at,
        expires_at: payment[0]?.expires_at
      });

    } catch (error) {
      console.error('Payment status error:', error);
      res.status(500).json({ error: 'Failed to get payment status' });
    }
  }
);

// POST /payments/webhook
paymentsRouter.post('/webhook', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;
    
    if (!signature || !timestamp) {
      return res.status(400).json({ error: 'Missing webhook headers' });
    }

    // Check timestamp to prevent replay attacks (5 minutes tolerance)
    const webhookTime = parseInt(timestamp);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - webhookTime) > 300) {
      return res.status(400).json({ error: 'Webhook timestamp too old' });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET || 'webhook-secret')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(signature.replace('sha256=', '')),
      Buffer.from(expectedSignature)
    )) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { payment_id, order_id, status, transaction_id, failure_reason } = req.body;

    // Validate required webhook fields
    if (!payment_id || !status) {
      return res.status(400).json({ error: 'Missing required webhook fields' });
    }

    await processWebhookWithRetry(payment_id, order_id, status, transaction_id, failure_reason);
    
    res.json({ success: true, processed_at: new Date().toISOString() });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /payments/:payment_id/cancel
paymentsRouter.post('/:payment_id/cancel',
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { payment_id } = req.params;

      // Get payment with user validation
      const payment = await sql`
        SELECT p.*, o.user_id 
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE p.payment_id = ${payment_id}
      `;

      if (payment.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      // Check if user owns this payment (unless admin)
      if (req.user!.role !== 'admin' && payment[0].user_id !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if payment can be cancelled
      if (payment[0].status !== PaymentStatus.PENDING) {
        return res.status(400).json({ error: 'Payment cannot be cancelled' });
      }

      await sql`
        UPDATE payments 
        SET status = ${PaymentStatus.CANCELLED}, 
            updated_at = CURRENT_TIMESTAMP,
            failure_reason = 'Cancelled by user'
        WHERE payment_id = ${payment_id}
      `;

      res.json({ success: true, message: 'Payment cancelled successfully' });

    } catch (error) {
      console.error('Payment cancellation error:', error);
      res.status(500).json({ error: 'Failed to cancel payment' });
    }
  }
);

// Enhanced webhook processing with better error handling and idempotency
async function processWebhookWithRetry(
  paymentId: string, 
  orderId: string, 
  status: string, 
  transactionId?: string,
  failureReason?: string,
  attempt = 1
) {
  const maxRetries = 3;
  
  try {
    // Idempotency check - prevent duplicate processing
    const existing = await sql`
      SELECT payment_id, status, transaction_id FROM payments 
      WHERE payment_id = ${paymentId}
    `;
    
    if (existing.length === 0) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    const currentPayment = existing[0];
    
    // If already processed with same transaction_id, return success
    if (currentPayment.status !== PaymentStatus.PENDING && 
        currentPayment.transaction_id === transactionId) {
      console.log(`Payment ${paymentId} already processed with transaction ${transactionId}`);
      return;
    }

    // Update payment status with additional fields
    await sql`
      UPDATE payments 
      SET 
        status = ${status}, 
        transaction_id = ${transactionId || null},
        failure_reason = ${failureReason || null},
        updated_at = CURRENT_TIMESTAMP,
        processed_at = CURRENT_TIMESTAMP
      WHERE payment_id = ${paymentId}
    `;

    // Update order status based on payment status
    if (status === PaymentStatus.SUCCESS) {
      await sql`
        UPDATE orders 
        SET 
          status = ${OrderStatus.PAID}, 
          updated_at = CURRENT_TIMESTAMP,
          paid_at = CURRENT_TIMESTAMP
        WHERE id = ${orderId}
      `;

      // Log successful payment
      console.log(`Payment ${paymentId} for order ${orderId} processed successfully`);
      
      // Here you could trigger additional actions like:
      // - Send confirmation email
      // - Update inventory
      // - Trigger fulfillment process
      
    } else if (status === PaymentStatus.FAILED) {
      console.log(`Payment ${paymentId} failed: ${failureReason}`);
    }

    // Clean up expired pending payments (optional background task)
    await cleanupExpiredPayments();

  } catch (error: any) {
    console.error(`Webhook processing attempt ${attempt} failed:`, error);
    
    if (attempt < maxRetries) {
      // Log retry attempt
      try {
        await sql`
          INSERT INTO webhook_retry_log (
            payment_id, 
            order_id, 
            attempt_number, 
            error_message, 
            retry_at,
            created_at
          )
          VALUES (
            ${paymentId}, 
            ${orderId}, 
            ${attempt}, 
            ${error.message}, 
            ${new Date(Date.now() + Math.pow(2, attempt) * 1000)},
            CURRENT_TIMESTAMP
          )
        `;
      } catch (logError) {
        console.error('Failed to log retry attempt:', logError);
      }
      
      // Exponential backoff retry
      const delay = Math.pow(2, attempt) * 1000;
      setTimeout(() => 
        processWebhookWithRetry(paymentId, orderId, status, transactionId, failureReason, attempt + 1), 
        delay
      );
    } else {
      // Dead letter - log final failure
      try {
        await sql`
          INSERT INTO webhook_retry_log (
            payment_id, 
            order_id, 
            attempt_number, 
            error_message,
            final_failure,
            created_at
          )
          VALUES (
            ${paymentId}, 
            ${orderId}, 
            ${attempt}, 
            ${'Max retries exceeded: ' + error.message},
            true,
            CURRENT_TIMESTAMP
          )
        `;
        
        // Mark payment as failed after max retries
        await sql`
          UPDATE payments 
          SET 
            status = ${PaymentStatus.FAILED}, 
            failure_reason = 'Webhook processing failed after maximum retries',
            updated_at = CURRENT_TIMESTAMP
          WHERE payment_id = ${paymentId}
        `;
      } catch (logError) {
        console.error('Failed to log final failure:', logError);
      }
      
      // Could also send alert to monitoring system here
      throw error;
    }
  }
}

// Helper function to clean up expired payments
async function cleanupExpiredPayments() {
  try {
    const result = await sql`
      UPDATE payments 
      SET 
        status = ${PaymentStatus.CANCELLED},
        failure_reason = 'Payment expired',
        updated_at = CURRENT_TIMESTAMP
      WHERE 
        status = ${PaymentStatus.PENDING} 
        AND expires_at < CURRENT_TIMESTAMP
      RETURNING payment_id
    `;
    
    if (result.length > 0) {
      console.log(`Cleaned up ${result.length} expired payments`);
    }
  } catch (error) {
    console.error('Failed to cleanup expired payments:', error);
  }
}

// GET /payments/health - Health check endpoint
paymentsRouter.get('/health', async (req, res) => {
  try {
    // Test database connectivity
    await sql`SELECT 1`;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

export { paymentsRouter };



// import { Router } from 'express';
// import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
// import crypto from 'crypto';
// import { OrderService } from '../services/orderService.js';
// import { sql } from '../config/database.ts';

// const paymentsRouter = Router();
// let orderService: OrderService;

// export const initializePaymentRoutes = (dbClient: typeof sql) => {
//   orderService = new OrderService(dbClient);
//   return paymentsRouter;
// };

// // POST /payments/initiate
// paymentsRouter.post('/initiate',
//   authenticate,
//   async (req: AuthenticatedRequest, res) => {
//     try {
//       const { order_id } = req.body;
      
//       // Get order
//       const order = await orderService.getOrderById(order_id, req.user!.id, req.user!.role);
//       if (!order) {
//         return res.status(404).json({ error: 'Order not found' });
//       }

//       // Create payment record
//       const paymentId = `pay_${crypto.randomBytes(16).toString('hex')}`;
//       const redirectUrl = `https://payment-provider.example.com/pay/${paymentId}`;

//       await sql`
//         INSERT INTO payments (order_id, payment_id, amount, status, redirect_url)
//         VALUES (${order_id}, ${paymentId}, ${order.total_amount}, 'PENDING', ${redirectUrl})
//       `;

//       res.json({
//         payment_id: paymentId,
//         redirect_url: redirectUrl,
//         amount: order.total_amount
//       });
//     } catch (error) {
//       console.error('Payment initiation error:', error);
//       res.status(500).json({ error: 'Failed to initiate payment' });
//     }
//   }
// );

// // POST /payments/webhook
// paymentsRouter.post('/webhook', async (req, res) => {
//   try {
//     // Verify webhook signature
//     const signature = req.headers['x-webhook-signature'] as string;
//     const payload = JSON.stringify(req.body);
//     const expectedSignature = crypto
//       .createHmac('sha256', process.env.WEBHOOK_SECRET || 'webhook-secret')
//       .update(payload)
//       .digest('hex');

//     if (signature !== `sha256=${expectedSignature}`) {
//       return res.status(401).json({ error: 'Invalid signature' });
//     }

//     const { payment_id, order_id, status } = req.body;

//     await processWebhookWithRetry(payment_id, order_id, status);
    
//     res.json({ success: true });
//   } catch (error) {
//     console.error('Webhook error:', error);
//     res.status(500).json({ error: 'Webhook processing failed' });
//   }
// });

// async function processWebhookWithRetry(paymentId: string, orderId: string, status: string, attempt = 1) {
//   const maxRetries = 3;
  
//   try {
//     // Note: Neon doesn't support traditional transactions like Pool
//     // We'll implement a simpler approach with idempotency checks
    
//     // Check if already processed (idempotency)
//     const existing = await sql`
//       SELECT * FROM payments 
//       WHERE payment_id = ${paymentId} AND status != 'PENDING'
//     `;
    
//     if (existing.length > 0) {
//       return; // Already processed
//     }

//     // Update payment status
//     await sql`
//       UPDATE payments 
//       SET status = ${status}, updated_at = CURRENT_TIMESTAMP 
//       WHERE payment_id = ${paymentId}
//     `;

//     // Update order status if payment successful
//     if (status === 'SUCCESS') {
//       await sql`
//         UPDATE orders 
//         SET status = 'PAID', updated_at = CURRENT_TIMESTAMP 
//         WHERE id = ${orderId}
//       `;
//     }

//   } catch (error: any) {
//     console.error(`Webhook processing attempt ${attempt} failed:`, error);
    
//     if (attempt < maxRetries) {
//       // Log retry attempt
//       try {
//         await sql`
//           INSERT INTO webhook_retry_log (payment_id, order_id, attempt_number, error_message, retry_at)
//           VALUES (${paymentId}, ${orderId}, ${attempt}, ${error.message}, ${new Date(Date.now() + Math.pow(2, attempt) * 1000)})
//         `;
//       } catch (logError) {
//         console.error('Failed to log retry attempt:', logError);
//       }
      
//       // Exponential backoff
//       const delay = Math.pow(2, attempt) * 1000;
//       setTimeout(() => processWebhookWithRetry(paymentId, orderId, status, attempt + 1), delay);
//     } else {
//       // Dead letter - log final failure
//       try {
//         await sql`
//           INSERT INTO webhook_retry_log (payment_id, order_id, attempt_number, error_message)
//           VALUES (${paymentId}, ${orderId}, ${attempt}, ${'Max retries exceeded: ' + error.message})
//         `;
//       } catch (logError) {
//         console.error('Failed to log final failure:', logError);
//       }
//     }
//   }
// }

// export { paymentsRouter };