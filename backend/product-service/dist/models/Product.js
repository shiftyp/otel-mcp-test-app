"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Product = void 0;
class Product {
    _id;
    id;
    name;
    description;
    price;
    currency;
    category;
    subcategory;
    brand;
    sku;
    inventory;
    images;
    specifications;
    tags;
    rating;
    weight;
    dimensions;
    isActive;
    isFeatured;
    createdAt;
    updatedAt;
    constructor(data) {
        this._id = data._id;
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
    toJSON() {
        return {
            _id: this._id,
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
    updateInventory(quantity, reserved = 0) {
        this.inventory.quantity = quantity;
        this.inventory.reserved = reserved;
        this.inventory.available = quantity - reserved;
        this.updatedAt = new Date();
    }
    reserveStock(quantity) {
        if (this.inventory.available >= quantity) {
            this.inventory.reserved += quantity;
            this.inventory.available -= quantity;
            this.updatedAt = new Date();
            return true;
        }
        return false;
    }
    releaseStock(quantity) {
        this.inventory.reserved = Math.max(0, this.inventory.reserved - quantity);
        this.inventory.available = this.inventory.quantity - this.inventory.reserved;
        this.updatedAt = new Date();
    }
    updateRating(newRating) {
        const totalRating = this.rating.average * this.rating.count + newRating;
        this.rating.count += 1;
        this.rating.average = totalRating / this.rating.count;
        this.updatedAt = new Date();
    }
}
exports.Product = Product;
//# sourceMappingURL=Product.js.map