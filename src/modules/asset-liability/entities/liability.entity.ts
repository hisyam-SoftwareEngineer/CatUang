export class LiabilityEntity {
  id: string;
  name: string;
  amount: string;
  currency: string;
  dueDate?: string;

  constructor(partial: Partial<LiabilityEntity>) {
    Object.assign(this, partial);
  }
}
