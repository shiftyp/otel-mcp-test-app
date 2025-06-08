export interface IProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  subcategory?: string;
  brand: string;
  sku: string;
  inventory: {
    quantity: number;
    reserved: number;
    available: number;
  };
  images: Array<{
    url: string;
    alt: string;
    isPrimary: boolean;
  }>;
  specifications: Record<string, string | number | boolean>;
  tags: string[];
  rating: {
    average: number;
    count: number;
  };
  weight?: {
    value: number;
    unit: 'kg' | 'g' | 'lb' | 'oz';
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in' | 'm';
  };
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Product implements IProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  subcategory?: string;
  brand: string;
  sku: string;
  inventory: {
    quantity: number;
    reserved: number;
    available: number;
  };
  images: Array<{
    url: string;
    alt: string;
    isPrimary: boolean;
  }>;
  specifications: Record<string, string | number | boolean>;
  tags: string[];
  rating: {
    average: number;
    count: number;
  };
  weight?: {
    value: number;
    unit: 'kg' | 'g' | 'lb' | 'oz';
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in' | 'm';
  };
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<IProduct>) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.description = data.description || '';
    this.price = data.price || 0;
    this.currency = data.currency || 'USD';
    this.category = data.category || '';
    this.subcategory = data.subcategory;
    this.brand = data.brand || '';
    this.sku = data.sku || '';
    this.inventory = data.inventory || {
      quantity: 0,
      reserved: 0,
      available: 0,
    };
    this.images = data.images || [];
    this.specifications = data.specifications || {};
    this.tags = data.tags || [];
    this.rating = data.rating || {
      average: 0,
      count: 0,
    };
    this.weight = data.weight;
    this.dimensions = data.dimensions;
    this.isActive = data.isActive ?? true;
    this.isFeatured = data.isFeatured ?? false;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  public toJSON(): IProduct {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      price: this.price,
      currency: this.currency,
      category: this.category,
      subcategory: this.subcategory,
      brand: this.brand,
      sku: this.sku,
      inventory: this.inventory,
      images: this.images,
      specifications: this.specifications,
      tags: this.tags,
      rating: this.rating,
      weight: this.weight,
      dimensions: this.dimensions,
      isActive: this.isActive,
      isFeatured: this.isFeatured,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  public updateInventory(quantity: number, reserved: number = 0): void {
    this.inventory.quantity = quantity;
    this.inventory.reserved = reserved;
    this.inventory.available = quantity - reserved;
    this.updatedAt = new Date();
  }

  public reserveStock(quantity: number): boolean {
    if (this.inventory.available >= quantity) {
      this.inventory.reserved += quantity;
      this.inventory.available -= quantity;
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  public releaseStock(quantity: number): void {
    this.inventory.reserved = Math.max(0, this.inventory.reserved - quantity);
    this.inventory.available = this.inventory.quantity - this.inventory.reserved;
    this.updatedAt = new Date();
  }

  public updateRating(newRating: number): void {
    const totalRating = this.rating.average * this.rating.count + newRating;
    this.rating.count += 1;
    this.rating.average = totalRating / this.rating.count;
    this.updatedAt = new Date();
  }
}