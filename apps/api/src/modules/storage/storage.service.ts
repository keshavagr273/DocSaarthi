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
    let endpoint = (this.config.get<string>('MINIO_ENDPOINT', 'localhost') || 'localhost').trim();
    // Strip leading https:// or http:// if user included it in environment variable
    endpoint = endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    const rawPort = this.config.get<string | number>('MINIO_PORT', 9000);
    const port = typeof rawPort === 'string' ? parseInt(rawPort, 10) : rawPort;

    const rawUseSSL = this.config.get<string | boolean>('MINIO_USE_SSL', false);
    const isCloudflare = endpoint.includes('r2.cloudflarestorage.com');
    const useSSL =
      rawUseSSL === true ||
      rawUseSSL === 'true' ||
      rawUseSSL === '1' ||
      port === 443 ||
      isCloudflare;

    const accessKey = this.config.getOrThrow<string>('MINIO_ACCESS_KEY');
    const secretKey = this.config.getOrThrow<string>('MINIO_SECRET_KEY');
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'docsaarthi');

    const protocol = useSSL ? 'https' : 'http';
    const endpointUrl =
      port === 443 || port === 80 || isCloudflare || !port
        ? `${protocol}://${endpoint}`
        : `${protocol}://${endpoint}:${port}`;

    this.client = new S3Client({
      endpoint: endpointUrl,
      region: isCloudflare ? 'auto' : 'us-east-1',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true, // Required for both MinIO and Cloudflare R2
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
   * Download an object as a Buffer (used by pipeline processor stages).
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
   * Get object metadata without downloading the body (alias for objectExists).
   * Used by pipeline processor stages.
   */
  async headObject(storageKey: string): Promise<HeadObjectCommandOutput | null> {
    return this.objectExists(storageKey);
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
