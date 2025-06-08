import { Router } from 'express';
import { listProducts } from './listProducts';
import { getProduct } from './getProduct';
import { createProduct } from './createProduct';
import { updateProduct } from './updateProduct';
import { deleteProduct } from './deleteProduct';
import { checkConnections } from './middleware';

const router = Router();

// Routes
router.get('/', checkConnections, listProducts);
router.get('/:id', checkConnections, getProduct);
router.post('/', checkConnections, createProduct);
router.put('/:id', checkConnections, updateProduct);
router.delete('/:id', checkConnections, deleteProduct);

export default router;