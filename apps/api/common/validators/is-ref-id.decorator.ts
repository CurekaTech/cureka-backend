import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidRefId } from '@packages/common';

@ValidatorConstraint({ name: 'isRefId', async: false })
export class IsRefIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidRefId(value);
  }

  defaultMessage(): string {
    return 'refId must be an 11-character code (e.g. SUN20261234)';
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
