export class AssetEntity {
  id: string;
  name: string;
  value: string;
  currency: string;
  acquiredAt: string;

  constructor(partial: Partial<AssetEntity>) {
    Object.assign(this, partial);
  }
}
