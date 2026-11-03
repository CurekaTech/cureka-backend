import { DoctorEntity } from '../entities/doctor.entity';

export type IDoctorResponse = Omit<DoctorEntity, 'passwordHash' | 'bankDetails'> & {
  bankDetails?: {
    accountHolderName: string;
    accountLast4: string;
    ifscCode: string;
    bankName: string | null;
  } | null;
};

export const mapDoctorEntityToResponse = (entity: DoctorEntity): IDoctorResponse => {
  const { passwordHash: _pw, bankDetails, ...rest } = entity as DoctorEntity & {
    passwordHash?: string;
  };

  return {
    ...rest,
    bankDetails: bankDetails
      ? {
          accountHolderName: bankDetails.accountHolderName,
          accountLast4: bankDetails.accountLast4,
          ifscCode: bankDetails.ifscCode,
          bankName: bankDetails.bankName,
        }
      : null,
  };
};
