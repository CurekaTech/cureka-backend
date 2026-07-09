import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PathAwareLoggingValidationPipe } from './path-aware-logging-validation.pipe';

class ConnectorAuthDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  merchantID?: string;

  @IsNotEmpty()
  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  channelWarehouseCodeToUniwareFacilityCode?: string;
}

class StrictDto {
  @IsNotEmpty()
  @IsString()
  id!: string;
}

describe('PathAwareLoggingValidationPipe', () => {
  it('allows extra connector fields on UniCommerce routes', async () => {
    const pipe = new PathAwareLoggingValidationPipe({
      url: '/api/v1/unicommerce/authToken',
    } as never);

    await expect(
      pipe.transform(
        {
          username: 'seller',
          password: 'secret',
          merchantID: 'seller',
          channelWarehouseCodeToUniwareFacilityCode: '{}',
          unexpectedConnectorField: 'ignored',
        },
        { type: 'body', metatype: ConnectorAuthDto },
      ),
    ).resolves.toEqual({
      username: 'seller',
      password: 'secret',
      merchantID: 'seller',
      channelWarehouseCodeToUniwareFacilityCode: '{}',
    });
  });

  it('rejects non-whitelisted fields on regular API routes', async () => {
    const pipe = new PathAwareLoggingValidationPipe({
      url: '/api/v1/orders',
    } as never);

    await expect(
      pipe.transform({ id: '1', extra: 'nope' }, { type: 'body', metatype: StrictDto }),
    ).rejects.toThrow('property extra should not exist');
  });
});
