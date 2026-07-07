import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

export const applyActiveMasterNameMatch = <T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  name: string,
): SelectQueryBuilder<T> =>
  qb
    .where(`LOWER(TRIM(${alias}.name)) = LOWER(TRIM(:name))`, { name })
    .andWhere(`${alias}.deletedAt IS NULL`);

export const existsActiveMasterByName = async <T extends ObjectLiteral>(
  repo: Repository<T>,
  alias: string,
  name: string,
  excludeRefId?: string,
): Promise<boolean> => {
  const qb = repo.createQueryBuilder(alias);
  applyActiveMasterNameMatch(qb, alias, name);

  if (excludeRefId) {
    qb.andWhere(`${alias}.refId != :excludeRefId`, { excludeRefId });
  }

  return (await qb.getCount()) > 0;
};
