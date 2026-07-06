import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, ILike } from 'typeorm';
import { GalleryEntity } from '../entities/gallery.entity';

@Injectable()
export class GalleryRepository {
  constructor(
    @InjectRepository(GalleryEntity)
    private readonly repo: Repository<GalleryEntity>,
  ) {}

  async create(data: Partial<GalleryEntity>, manager?: EntityManager): Promise<GalleryEntity> {
    const repository = manager ? manager.getRepository(GalleryEntity) : this.repo;
    const entity = repository.create(data);
    return repository.save(entity);
  }

  async findByRefId(refId: string, manager?: EntityManager): Promise<GalleryEntity | null> {
    const repository = manager ? manager.getRepository(GalleryEntity) : this.repo;
    return repository.findOne({ where: { refId } });
  }

  async deleteByRefId(refId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(GalleryEntity) : this.repo;
    await repository.softDelete({ refId });
  }

  async findHistory(
    page: number,
    limit: number,
    search?: string,
  ): Promise<[GalleryEntity[], number]> {
    const query = this.repo.createQueryBuilder('gallery');
    const searchText = search?.trim();

    if (searchText) {
      query.where(
        '(gallery.filename ILIKE :search OR gallery.refId ILIKE :search)',
        { search: `%${searchText}%` },
      );
    }

    return query
      .orderBy('gallery.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { refId } });
    return count > 0;
  }

  async findAllActive(): Promise<GalleryEntity[]> {
    return this.repo.find();
  }
}
