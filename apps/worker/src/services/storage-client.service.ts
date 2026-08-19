import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * StorageClientService — worker-side MinIO client.
 *
 * Provides the minimal subset of storage operations needed by the pipeline:
 * download, upload, headObject, presignedUrl.
 */
@Injectable()
export class StorageClientService implements OnModuleInit {
  private readonly logger = new Logger(StorageClientService.name);
  private client!: S3Client;
  private bucket!: string;

  onModuleInit(): void {
    const endpoint = process.env['MINIO_ENDPOINT'] ?? 'localhost';
    const port = parseInt(process.env['MINIO_PORT'] ?? '9000', 10);
    const useSSL = process.env['MINIO_USE_SSL'] === 'true';
    const accessKey = process.env['MINIO_ACCESS_KEY'] ?? 'docsaarthi_minio';
    const secretKey = process.env['MINIO_SECRET_KEY'] ?? 'docsaarthi_minio_secret';
    this.bucket = process.env['MINIO_BUCKET'] ?? 'docsaarthi';

    const protocol = useSSL ? 'https' : 'http';

    this.client = new S3Client({
      endpoint: `${protocol}://${endpoint}:${port}`,
      region: 'us-east-1',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true,
    });

    this.logger.log(`Worker storage → ${protocol}://${endpoint}:${port}/${this.bucket}`);
  }

  /**
   * Download an object as a Buffer.
   */
  async downloadBuffer(storageKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Empty response body for key: ${storageKey}`);
    }

    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Get object metadata without downloading the body.
   */
  async headObject(storageKey: string): Promise<HeadObjectCommandOutput | null> {
    try {
      return await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
    } catch {
      return null;
    }
  }

  /**
   * Upload a buffer to MinIO.
   */
  async uploadBuffer(
    storageKey: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      }),
    );
  }

  /**
   * Generate a presigned GET URL (default 24h expiry).
   */
  async presignedDownloadUrl(
    storageKey: string,
    expirySeconds: number = 86400,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    return getSignedUrl(this.client, command, { expiresIn: expirySeconds });
  }

  get bucketName(): string {
    return this.bucket;
  }
}
