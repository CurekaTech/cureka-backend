import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';

@Entity('gallery')
export class GalleryEntity extends BaseEntity {
  @Index()
  @Column({ name: 'filename', type: 'varchar', length: 255 })
  filename!: string;

  @Column({ name: 'url', type: 'varchar', length: 1024 })
  url!: string;

  @Column({ name: 'mimetype', type: 'varchar', length: 100 })
  mimetype!: string;

  @Column({ name: 'size', type: 'integer' })
  size!: number;
}
