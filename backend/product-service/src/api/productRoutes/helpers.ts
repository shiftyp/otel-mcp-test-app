import { IProduct } from '../../models/Product';

export function convertDbRowToProduct(row: any): IProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price),
    currency: row.currency,
    category: row.category,
    subcategory: row.subcategory,
    brand: row.brand,
    sku: row.sku,
    inventory: {
      quantity: row.inventory_quantity,
      reserved: row.inventory_reserved,
      available: row.inventory_available,
    },
    images: row.images || [],
    specifications: row.specifications || {},
    tags: row.tags || [],
    rating: {
      average: parseFloat(row.rating_average) || 0,
      count: row.rating_count || 0,
    },
    weight: row.weight,
    dimensions: row.dimensions,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}