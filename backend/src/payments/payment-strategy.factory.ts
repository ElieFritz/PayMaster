import { BadRequestException, Injectable } from '@nestjs/common';

import {
  getCemacCountryConfig,
  normalizeCountryCode,
  SUPPORTED_CEMAC_COUNTRIES_LABEL,
} from '../common/constants/countries';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { PaymentStrategy } from './interfaces/payment-strategy.interface';
import { NotchPayService } from './providers/notchpay.service';
import { ZikoPayService } from './providers/zikopay.service';

@Injectable()
export class PaymentStrategyFactory {
  private readonly strategies: PaymentStrategy[];

  constructor(
    private readonly notchPayService: NotchPayService,
    private readonly zikoPayService: ZikoPayService,
  ) {
    this.strategies = [this.notchPayService, this.zikoPayService];
  }

  resolveByCountry(country: string): PaymentStrategy {
    const normalizedCountry = normalizeCountryCode(country);
    const countryConfig = getCemacCountryConfig(normalizedCountry);

    if (!countryConfig) {
      throw new BadRequestException(
        `Country ${normalizedCountry} is not supported. Supported countries: ${SUPPORTED_CEMAC_COUNTRIES_LABEL}.`,
      );
    }

    return countryConfig.provider === PaymentProvider.NOTCHPAY
      ? this.notchPayService
      : this.zikoPayService;
  }

  resolveByProvider(provider: string): PaymentStrategy {
    const normalizedProvider = provider.trim().toUpperCase();

    if (normalizedProvider === PaymentProvider.NOTCHPAY) {
      return this.notchPayService;
    }

    if (normalizedProvider === PaymentProvider.ZIKOPAY) {
      return this.zikoPayService;
    }

    const strategy = this.strategies.find((item) => item.provider === normalizedProvider);
    if (!strategy) {
      throw new Error(`Unsupported payment provider: ${provider}`);
    }

    return strategy;
  }
}
