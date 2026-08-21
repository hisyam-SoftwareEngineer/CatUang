import { Injectable } from '@nestjs/common';
import { FileStorageService } from './file-storage.interface';

@Injectable()
export class DummyStorageService implements FileStorageService {
  async uploadFile(fileBuffer: Buffer, filename: string): Promise<string> {
    // In a real app, this would upload to Cloudinary and return the secure_url
    return `https://dummy-cloudinary.com/image/${filename}`;
  }
}
