import { Inject, Injectable, Scope, ValidationPipeOptions } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { APP_CONSTANTS } from '../app.constants';
import { LoggingValidationPipe } from './logging-validation.pipe';

const UNICOMMERCE_PREFIX = `/${APP_CONSTANTS.API_PREFIX}/unicommerce/`;

@Injectable({ scope: Scope.REQUEST })
export class PathAwareLoggingValidationPipe extends LoggingValidationPipe {
  constructor(@Inject(REQUEST) request: FastifyRequest) {
    const path = request.url.split('?')[0] ?? request.url;
    const isUnicommerceRoute = path.startsWith(UNICOMMERCE_PREFIX);

    const options: ValidationPipeOptions = {
      whitelist: true,
      forbidNonWhitelisted: !isUnicommerceRoute,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    };

    super(options);
  }
}
