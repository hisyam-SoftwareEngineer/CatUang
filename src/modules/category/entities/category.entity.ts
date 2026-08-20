/**
 * Response shape untuk Category — terpisah dari Prisma model.
 * Sesuai 03-backend-guide.md §1.
 */
export class CategoryEntity {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;

  constructor(partial: Partial<CategoryEntity>) {
    Object.assign(this, partial);
  }
}
