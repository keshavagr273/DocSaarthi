import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { createPresignedPost, PresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUploadResult {
  url: string;
  fields: Record<string, string>;
  storageKey: string;
  expiresAt: Date;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get<number>('MINIO_PORT', 9000);
    const useSSL = this.config.get<boolean>('MINIO_USE_SSL', false);
    const accessKey = this.config.getOrThrow<string>('MINIO_ACCESS_KEY');
    const secretKey = this.config.getOrThrow<string>('MINIO_SECRET_KEY');
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'docsaarthi');

    const protocol = useSSL ? 'https' : 'http';
    const endpointUrl =
      port === 443 || port === 80 || !port
        ? `${protocol}://${endpoint}`
        : `${protocol}://${endpoint}:${port}`;

    this.client = new S3Client({
      endpoint: endpointUrl,
      region: 'auto', // R2 requires region: 'auto' or us-east-1
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true, // Compatible with R2 and MinIO
    });

    this.logger.log(`Storage connected → ${endpointUrl}/${this.bucket}`);
  }

  /**
   * Generate a presigned POST URL for direct-to-MinIO upload.
   * The file is uploaded directly from the browser — the API never handles the file bytes.
   */
  async createPresignedUpload(
    storageKey: string,
    mimeType: string,
    maxSizeBytes: number,
    expirySeconds: number = 3600,
  ): Promise<PresignedUploadResult> {
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const post: PresignedPost = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: storageKey,
      Conditions: [
        ['content-length-range', 1, maxSizeBytes],
        ['eq', '$Content-Type', mimeType],
      ],
      Fields: { 'Content-Type': mimeType },
      Expires: expirySeconds,
    });

    return {
      url: post.url,
      fields: post.fields,
      storageKey,
      expiresAt,
    };
  }

  /**
   * Generate a presigned GET URL to download an object.
   */
  async createPresignedDownloadUrl(
    storageKey: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return getSignedUrl(this.client, command, { expiresIn: expirySeconds });
  }

  /**
   * Check if an object exists in storage without downloading it.
   */
  async objectExists(storageKey: string): Promise<HeadObjectCommandOutput | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Directly upload a buffer to storage (server-side).
   */
  async uploadBuffer(
    storageKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  /**
   * Delete an object from storage.
   */
  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }

  /**
   * Health check — verifies connectivity to MinIO.
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try to check a dummy key — a 404 still means the server is up
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: '__health_check__' }),
      );
      return true;
    } catch (err: unknown) {
      const code = (err as { name?: string }).name;
      // NotFound = server is up but key doesn't exist — that's fine
      if (code === 'NotFound' || code === 'NoSuchKey') return true;
      this.logger.error(`Storage health check failed: ${String(err)}`);
      return false;
    }
  }
}
