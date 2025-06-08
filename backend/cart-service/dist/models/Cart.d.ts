export interface CartItem {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    imageUrl?: string;
}
export interface Cart {
    userId: string;
    items: CartItem[];
    createdAt: Date;
    updatedAt: Date;
}
export interface CartResponseDTO {
    userId: string;
    items: CartItem[];
    total: number;
    itemCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface AddToCartDTO {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    imageUrl?: string;
}
export interface UpdateCartItemDTO {
    quantity: number;
}
export interface CartOperationResult {
    success: boolean;
    cart?: CartResponseDTO;
    error?: string;
}
//# sourceMappingURL=Cart.d.ts.map