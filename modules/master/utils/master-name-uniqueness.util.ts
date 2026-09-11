import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

export type ActiveMasterNameMatchOptions = {
  /** Column to match (default `name`). Use `title` for reason masters. */
  column?: string;
  /** Optional scope, e.g. `{ column: 'countryId', value: countryUuid }`. */
  scope?: { column: string; value: string };
};

export const applyActiveMasterNameMatch = <T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  name: string,
  options?: ActiveMasterNameMatchOptions,
): SelectQueryBuilder<T> => {
  const column = options?.column ?? 'name';
  qb
    .where(`LOWER(TRIM(${alias}.${column})) = LOWER(TRIM(:name))`, { name })
    .andWhere(`${alias}.deletedAt IS NULL`);

  if (options?.scope) {
    qb.andWhere(`${alias}.${options.scope.column} = :scopeValue`, {
      scopeValue: options.scope.value,
    });
  }

  return qb;
};

export const existsActiveMasterByName = async <T extends ObjectLiteral>(
  repo: Repository<T>,
  alias: string,
  name: string,
  excludeRefId?: string,
  options?: ActiveMasterNameMatchOptions,
): Promise<boolean> => {
  const qb = repo.createQueryBuilder(alias);
  applyActiveMasterNameMatch(qb, alias, name, options);

  if (excludeRefId) {
    qb.andWhere(`${alias}.refId != :excludeRefId`, { excludeRefId });
  }

  return (await qb.getCount()) > 0;
};
