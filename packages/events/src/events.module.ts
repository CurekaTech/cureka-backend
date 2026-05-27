import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      // Use wildcards: 'order.*' matches 'order.created', 'order.updated', etc.
      wildcard: true,
      // Delimiter for namespacing
      delimiter: '.',
      // Maximum listeners per event
      maxListeners: 20,
      // Throw on errors rather than silently dropping
      ignoreErrors: false,
    }),
  ],
  exports: [EventEmitterModule],
})
export class EventsModule {}
