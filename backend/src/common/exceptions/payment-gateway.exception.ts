import { BadGatewayException } from '@nestjs/common';

import { PaymentProvider } from '../enums/payment-provider.enum';

export class PaymentGatewayException extends BadGatewayException {
  constructor(provider: PaymentProvider, message: string, cause?: unknown) {
    super({
      provider,
      message,
      cause: cause instanceof Error ? cause.message : cause,
    });
  }
}
