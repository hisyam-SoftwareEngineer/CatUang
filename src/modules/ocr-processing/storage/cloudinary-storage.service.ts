import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { FileStorageService } from './file-storage.interface';

@Injectable()
export class CloudinaryStorageService implements FileStorageService {
  private readonly logger = new Logger(CloudinaryStorageService.name);
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get('CLOUDINARY_API_SECRET');

    this.isConfigured = !!(cloudName && apiKey && apiSecret);

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.logger.log('Cloudinary storage is configured and ready');
    } else {
      this.logger.warn('Cloudinary credentials missing. Falling back to dummy storage.');
    }
  }

  async uploadFile(fileBuffer: Buffer, filename: string): Promise<string> {
    if (!this.isConfigured) {
      return `https://dummy-cloudinary.com/image/${filename}`;
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'catuang-receipts',
          public_id: `${Date.now()}-${filename.replace(/\.[^/.]+$/, "")}`, // strip extension for public_id
          resource_type: 'auto',
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(new Error('Gagal mengupload gambar'));
          }
          resolve(result.secure_url);
        },
      );

      uploadStream.end(fileBuffer);
    });
  }
}
