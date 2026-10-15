import { Controller, Get } from '@nestjs/common';
import { serviceTierSchema } from '@fisher/contracts';

@Controller('foundation')
export class FoundationController {
  @Get('service-tiers')
  tiers() {
    // Static contract introspection only; this does not imply that booking or prices are live.
    return { availableForBooking: false, configuredTiers: serviceTierSchema.options };
  }
}
