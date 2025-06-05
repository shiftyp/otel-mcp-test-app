import { ObjectId } from 'mongodb';
export interface IProduct {
    _id?: ObjectId;
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
export declare class Product implements IProduct {
    _id?: ObjectId;
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
    constructor(data: Partial<IProduct>);
    toJSON(): IProduct;
    updateInventory(quantity: number, reserved?: number): void;
    reserveStock(quantity: number): boolean;
    releaseStock(quantity: number): void;
    updateRating(newRating: number): void;
}
//# sourceMappingURL=Product.d.ts.map