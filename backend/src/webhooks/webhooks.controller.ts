import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';

import { ProviderParamDto } from './dto/provider-param.dto';
import { WebhooksService } from './webhooks.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@Controller()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  async handleProviderWebhook(
    @Param() params: ProviderParamDto,
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(body || {}));

    await this.webhooksService.handleWebhook(params.provider, rawBody, body, headers);

    return { received: true };
  }
}
