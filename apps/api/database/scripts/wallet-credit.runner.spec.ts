import { parseCreditAmount, parseWalletCreditCli, normalizeIndianMobile } from './wallet-credit.runner';

describe('wallet:credit arguments', () => {
  it('reads phone and amount from flags', () => {
    expect(parseWalletCreditCli(['--phone=8888888888', '--amount=2000', '--apply'])).toEqual({
      phone: '8888888888',
      amount: '2000',
      apply: true,
      help: false,
    });
  });

  it('normalizes a country-code mobile and the credit amount', () => {
    expect(normalizeIndianMobile('+91 88888 88888')).toBe('8888888888');
    expect(parseCreditAmount('2000')).toEqual({ rupees: '2000.00', paise: 200_000 });
    expect(parseCreditAmount('500.50')).toEqual({ rupees: '500.50', paise: 50_050 });
  });

  it('rejects a landline-length number and a non-positive amount', () => {
    expect(() => normalizeIndianMobile('12345')).toThrow(/10-digit/);
    expect(() => parseCreditAmount('0')).toThrow(/greater than zero/);
  });
});
