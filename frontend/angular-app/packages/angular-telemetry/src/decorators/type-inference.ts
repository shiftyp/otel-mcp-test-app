/**
 * Advanced type inference utilities for decorators
 */

/**
 * Extract method parameter types from a class method
 */
export type MethodArgs<T, K extends keyof T> = T[K] extends (...args: infer P) => any ? P : never;

/**
 * Extract method return type from a class method
 */
export type MethodReturnType<T, K extends keyof T> = T[K] extends (...args: any[]) => infer R ? R : never;

/**
 * Unwrap Promise type
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Extract unwrapped return type (handles both sync and async)
 */
export type UnwrappedReturnType<T, K extends keyof T> = UnwrapPromise<MethodReturnType<T, K>>;

/**
 * Type-safe method decorator with automatic inference
 */
export type InferredMethodDecorator<T = any, K extends keyof T = any> = (
  target: T,
  propertyKey: K,
  descriptor: TypedPropertyDescriptor<T[K]>
) => TypedPropertyDescriptor<T[K]> | void;