import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidRefId } from '../ref-id.util';

@ValidatorConstraint({ name: 'isRefId', async: false })
export class IsRefIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidRefId(value);
  }

  defaultMessage(): string {
    return 'refId must be a valid code (11 or 13 chars), e.g. SUN20261234 or SUN2026123456';
  }
}

export const IsRefId = (validationOptions?: ValidationOptions) => {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRefIdConstraint,
    });
  };
};
