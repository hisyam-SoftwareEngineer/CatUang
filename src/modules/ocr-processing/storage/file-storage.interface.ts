export interface FileStorageService {
  uploadFile(fileBuffer: Buffer, filename: string): Promise<string>;
}
