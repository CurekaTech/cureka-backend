export type UnicommerceAuthEndpoint = 'productsCount' | 'products' | 'updateInventory';

export class UnicommerceUnauthorizedException extends Error {
  constructor(public readonly endpoint: UnicommerceAuthEndpoint) {
    super('Unicommerce unauthorized');
    this.name = 'UnicommerceUnauthorizedException';
  }
}
