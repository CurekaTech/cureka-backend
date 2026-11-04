import { ObjectLiteral, Repository } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';

export async function generateEntityRefId<T extends ObjectLiteral>(
  repo: Repository<T>,
  prefix: string,
): Promise<string> {
  return generateUniqueRefId(prefix, (refId) =>
    repo.exists({ where: { refId } as never }),
  );
}
