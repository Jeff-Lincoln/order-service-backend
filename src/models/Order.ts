
// Database Models and Migrations

// Order status enumeration
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}

// Payment status enumeration
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED'
}

// User role enumeration
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

// Order item interface
export interface OrderItem {
  id?: string;
  sku: string;
  quantity: number;
  price: number;
  productName?: string;
  totalPrice?: number;
  variant?: string;
  metadata?: Record<string, any>;
}

// Shipping address interface
export interface ShippingAddress {
  firstName: string;
  lastName: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phoneNumber?: string;
}

// Main Order interface
export interface Order {
  id: string | null;
  user_id: string;
  orderNumber: string | null;
  items: OrderItem[];
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  client_token: string;
  
  // Pricing fields
  total_amount: number;
  subtotal?: number;
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  
  // Shipping information
  shippingAddress?: ShippingAddress;
  shippingMethod?: string;
  trackingNumber?: string;
  
  // Payment information
  paymentMethod?: string;
  paymentIntentId?: string;
  
  // Versioning and timestamps
  version: number;
  created_at: Date;
  updated_at: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  
  // Additional fields
  notes?: string;
  metadata?: Record<string, any>;
}

// Create order input interface
export interface CreateOrderInput {
  user_id: string;
  items: Omit<OrderItem, 'id' | 'totalPrice'>[];
  client_token: string;
  shippingAddress?: ShippingAddress;
  shippingMethod?: string;
  paymentMethod?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// Update order input interface
export interface UpdateOrderInput {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  trackingNumber?: string;
  shippingAddress?: ShippingAddress;
  notes?: string;
  metadata?: Record<string, any>;
}

// Order query filters
export interface OrderFilters {
  user_id?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}

// Database row interface (for raw database queries)
export interface OrderRow {
  id: string | null;
  user_id: string | null;
  order_number?: string | null;
  items: string | null; // JSON string
  status: OrderStatus | null;
  payment_status?: PaymentStatus | null;
  client_token: string;
  total_amount: number;
  subtotal?: number;
  tax_amount?: number;
  shipping_amount?: number;
  discount_amount?: number;
  shipping_address?: string; // JSON string
  shipping_method?: string;
  tracking_number?: string;
  payment_method?: string;
  payment_intent_id?: string;
  version: number;
  created_at: Date;
  updated_at: Date;
  shipped_at?: Date;
  delivered_at?: Date;
  notes?: string;
  metadata?: string; // JSON string
}

// Helper functions for data transformation
export const OrderHelpers = {
  /**
   * Convert database row to Order object
   */
  fromRow(row: OrderRow): any {
    if (!row.id) throw new Error('Order ID is required');
    return {
      id: row.id,
      user_id: row.user_id!,
      orderNumber: row.order_number!,
      items: JSON.parse(row.items!),
      status: row.status!,
      paymentStatus: row.payment_status!,
      client_token: row.client_token,
      total_amount: row.total_amount,
      subtotal: row.subtotal,
      taxAmount: row.tax_amount,
      shippingAmount: row.shipping_amount,
      discountAmount: row.discount_amount,
      shippingAddress: row.shipping_address ? JSON.parse(row.shipping_address) : undefined,
      shippingMethod: row.shipping_method,
      trackingNumber: row.tracking_number,
      paymentMethod: row.payment_method,
      paymentIntentId: row.payment_intent_id,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      shippedAt: row.shipped_at,
      deliveredAt: row.delivered_at,
      notes: row.notes,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  },

  /**
   * Convert Order object to database row format
   */
  toRow(order: Partial<Order>): any {
    return {
      id: order.id,
      user_id: order.user_id,
      order_number: order.orderNumber,
      items: order.items ? JSON.stringify(order.items) : undefined,
      status: order.status,
      payment_status: order.paymentStatus,
      client_token: order.client_token,
      total_amount: order.total_amount,
      subtotal: order.subtotal,
      tax_amount: order.taxAmount,
      shipping_amount: order.shippingAmount,
      discount_amount: order.discountAmount,
      shipping_address: order.shippingAddress ? JSON.stringify(order.shippingAddress) : undefined,
      shipping_method: order.shippingMethod,
      tracking_number: order.trackingNumber,
      payment_method: order.paymentMethod,
      payment_intent_id: order.paymentIntentId,
      version: order.version,
      created_at: order.created_at,
      updated_at: order.updated_at,
      shipped_at: order.shippedAt,
      delivered_at: order.deliveredAt,
      notes: order.notes,
      metadata: order.metadata ? JSON.stringify(order.metadata) : undefined
    };
  },

  /**
   * Calculate order totals
   */
  calculateTotals(items: OrderItem[]): {
    subtotal: number;
    itemCount: number;
  } {
    const subtotal = items.reduce((sum, item) => {
      const itemTotal = item.totalPrice || (item.price * item.quantity);
      return sum + itemTotal;
    }, 0);

    return {
      subtotal: Number(subtotal.toFixed(2)),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
    };
  },

  /**
   * Validate order items
   */
  validateItems(items: OrderItem[]): boolean {
    return items.every(item => 
      item.sku && 
      typeof item.quantity === 'number' && 
      item.quantity > 0 &&
      typeof item.price === 'number' && 
      item.price > 0
    );
  }
};

// Order summary for analytics
export interface OrderSummary {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByPaymentStatus: Record<PaymentStatus, number>;
}

// Shipping address interface
export interface ShippingAddress {
  firstName: string;
  lastName: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phoneNumber?: string;
}

