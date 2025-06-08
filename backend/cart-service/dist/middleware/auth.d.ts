import { Request, Response, NextFunction } from 'express';
interface AuthRequest extends Request {
    user?: {
        userId: string;
        username: string;
        email: string;
    };
}
export declare const authMiddleware: (req: AuthRequest, res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=auth.d.ts.map