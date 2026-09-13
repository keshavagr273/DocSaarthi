import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { SettingsService } from './settings.service';
import { DatabaseService } from '@docsaarthi/database';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../../common/services/cache.service';

describe('SettingsService - changePassword', () => {
  let service: SettingsService;
  let db: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    session: {
      deleteMany: jest.Mock;
    };
    refreshToken: {
      updateMany: jest.Mock;
    };
  };
  let audit: {
    log: jest.Mock;
  };
  let cache: {
    del: jest.Mock;
  };

  beforeEach(async () => {
    db = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        deleteMany: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
    };
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should throw BadRequestException if user does not exist or has no passwordHash', async () => {
    db.user.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      }),
    ).rejects.toThrow(BadRequestException);

    db.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash: null });

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw UnauthorizedException if current password does not match', async () => {
    const originalHash = await argon2.hash('correctPassword123');
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: originalHash,
    });

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'wrongPassword123',
        newPassword: 'newPassword123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should update password hash, revoke sessions and refresh tokens, and log audit event', async () => {
    const originalHash = await argon2.hash('correctPassword123');
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: originalHash,
    });
    db.user.update.mockResolvedValue({ id: 'user-1' });
    db.session.deleteMany.mockResolvedValue({ count: 2 });
    db.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.changePassword('user-1', {
      currentPassword: 'correctPassword123',
      newPassword: 'brandNewPassword456',
    });

    expect(result).toEqual({
      message: 'Password updated successfully. Please log in again.',
    });

    expect(db.user.update).toHaveBeenCalledTimes(1);
    const updateCall = db.user.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'user-1' });
    // Verify the new password hash is valid against brandNewPassword456
    const isNewValid = await argon2.verify(
      updateCall.data.passwordHash,
      'brandNewPassword456',
    );
    expect(isNewValid).toBe(true);

    // Verify session and token revocation
    expect(db.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRevoked: false },
      data: expect.objectContaining({ isRevoked: true }),
    });

    // Verify audit event
    expect(audit.log).toHaveBeenCalledWith({
      eventType: 'PASSWORD_CHANGED',
      actorId: 'user-1',
      resourceType: 'USER',
      resourceId: 'user-1',
    });
  });
});
