# ADR-005: Coexistence of Imperative and Declarative APIs

## Status
Accepted

## Context
While decorators provide a clean, declarative approach to telemetry, there are scenarios where imperative (manual) telemetry calls are necessary:
- Complex conditional logic
- Dynamic metric names or attributes
- Integration with third-party libraries
- Debugging and troubleshooting
- Gradual migration from existing code

We need to decide whether to:
1. Force all telemetry through decorators
2. Provide only imperative APIs
3. Support both approaches seamlessly

## Decision
We will support both declarative (decorator) and imperative (method call) telemetry APIs, ensuring they work together seamlessly:

1. **Decorators** handle common cases automatically
2. **Imperative methods** remain available for complex scenarios
3. **Namespace context** is shared between both approaches
4. **Configuration** affects both decorator and imperative telemetry

## Consequences

### Positive
- **Flexibility**: Use the right tool for each scenario
- **Gradual adoption**: Can migrate incrementally
- **Power when needed**: Complex scenarios remain possible
- **Debugging**: Can add temporary imperative telemetry
- **Third-party integration**: Can instrument code you don't control

### Negative
- **Two patterns**: Developers must understand both approaches
- **Potential inconsistency**: Teams might mix styles unnecessarily
- **Documentation overhead**: Must document both APIs
- **Maintenance**: Two code paths to maintain

## Example
```typescript
@Telemetry('payment.processor')
export class PaymentService {
  constructor(private telemetry: TelemetryService) {}
  
  @Traced()
  @Metric('payment.attempt')
  async processPayment(payment: Payment) {
    // Decorator handles standard instrumentation
    
    // Complex conditional telemetry via imperative API
    if (payment.amount > 10000) {
      this.telemetry.recordMetric('high_value_payment', payment.amount, {
        'payment.method': payment.method,
        'payment.currency': payment.currency
      });
      
      this.telemetry.log('High value payment detected', {
        amount: payment.amount,
        customerId: payment.customerId
      }, 'warn');
    }
    
    try {
      const result = await this.gateway.process(payment);
      
      // Dynamic metric based on result
      this.telemetry.recordMetric(
        `payment.${result.status}`,  // Dynamic metric name
        payment.amount,
        result.metadata  // Dynamic attributes
      );
      
      return result;
    } catch (error) {
      // Imperative error handling
      this.telemetry.logError('Payment processing failed', error);
      throw error;
    }
  }
}
```

## Best Practices
1. Use decorators for standard, repetitive instrumentation
2. Use imperative calls for complex, conditional, or dynamic telemetry
3. Ensure consistent naming between declarative and imperative usage
4. Document when and why imperative telemetry is used