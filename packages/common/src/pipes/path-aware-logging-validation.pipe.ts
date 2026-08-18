import { Inject, Injectable, Scope, ValidationPipeOptions } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { APP_CONSTANTS } from '../app.constants';
import { LoggingValidationPipe } from './logging-validation.pipe';

const UNICOMMERCE_PREFIX = `/${APP_CONSTANTS.API_PREFIX}/unicommerce/`;
const GOKWIK_PREFIX = `/${APP_CONSTANTS.API_PREFIX}/gokwik/`;
const BOB_PREFIX = `/${APP_CONSTANTS.API_PREFIX}/bob`;
const SHIPWAY_WEBHOOK_PATH = `/${APP_CONSTANTS.API_PREFIX}/shipments/webhook`;

@Injectable({ scope: Scope.REQUEST })
export class PathAwareLoggingValidationPipe extends LoggingValidationPipe {
  constructor(@Inject(REQUEST) request: FastifyRequest) {
    const path = request.url.split('?')[0] ?? request.url;
    const allowExtraFields =
      path.startsWith(UNICOMMERCE_PREFIX) ||
      path.startsWith(GOKWIK_PREFIX) ||
      path.startsWith(BOB_PREFIX);
      path === SHIPWAY_WEBHOOK_PATH ||
      path.startsWith(`${SHIPWAY_WEBHOOK_PATH}/`);

    const options: ValidationPipeOptions = {
      whitelist: true,
      forbidNonWhitelisted: !allowExtraFields,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    };

    super(options);
  }
}
