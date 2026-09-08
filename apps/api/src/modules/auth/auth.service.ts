import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '@docsaarthi/database';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    preferredLanguage: string;
  };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Argon2id parameters (OWASP recommended)
  private readonly ARGON2_OPTIONS: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 1,
  };

  constructor(
    private readonly db: DatabaseService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  // ── Registration ────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    // 1. Check email uniqueness (case-insensitive)
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // 2. Hash password
    const passwordHash = await argon2.hash(dto.password, this.ARGON2_OPTIONS);

    // 3. Create user
    const normalizedEmail = dto.email.toLowerCase().trim();
    const isOwner = normalizedEmail === 'keshavagrawal273@gmail.com';
    const user = await this.db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: dto.name.trim(),
        preferredLanguage: dto.preferredLanguage ?? 'en',
        role: isOwner ? ('ADMIN' as any) : ('USER' as any),
      },
    });

    // 4. Create session
    const session = await this.createSession(user.id, ipAddress, userAgent);

    // 5. Generate tokens
    const tokens = await this.generateTokenPair(user.id, user.email, user.role, session.id);

    // 6. Audit log
    await this.auditService.log({
      eventType: 'AUTH_REGISTER',
      actorId: user.id,
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    this.logger.log(`New user registered: ${user.email} (${user.id})`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
      },
      tokens,
    };
  }

  // ── Login ───────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    // 1. Find user (always do the same work to prevent timing attacks)
    const user = await this.usersService.findByEmail(dto.email);

    // 2. Verify password (always run even if user not found to prevent timing attacks)
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=1$placeholder';
    const isValid = user
      ? await argon2.verify(user.passwordHash ?? dummyHash, dto.password)
      : (await argon2.verify(dummyHash, 'dummy').catch(() => false), false);

    if (!user || !isValid) {
      // Log failed attempt
      await this.auditService.log({
        eventType: 'AUTH_LOGIN_FAILED',
        actorId: user?.id,
        resourceType: 'USER',
        resourceId: user?.id ?? 'unknown',
        ipAddress,
        userAgent,
        changes: { email: dto.email },
      });

      // Generic error — do not reveal whether email exists
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // 3. Create session
    const session = await this.createSession(user.id, ipAddress, userAgent);

    // Auto-promote owner email to ADMIN if not already
    let userRole = user.role;
    if (user.email.toLowerCase() === 'keshavagrawal273@gmail.com' && user.role !== 'ADMIN') {
      userRole = 'ADMIN' as any;
      await this.db.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
    }

    // 4. Generate tokens
    const tokens = await this.generateTokenPair(user.id, user.email, userRole, session.id);

    // 5. Update last login timestamp
    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 6. Audit log
    await this.auditService.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      actorId: user.id,
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    this.logger.log(`User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
      },
      tokens,
    };
  }

  // ── Logout ──────────────────────────────────────────────────

  async logout(
    refreshToken: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    // Revoke refresh token (silent fail if not found)
    const revoked = await this.db.refreshToken.updateMany({
      where: { tokenHash, userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    if (revoked.count > 0) {
      // Delete associated session
      await this.db.session.deleteMany({ where: { userId } });
    }

    await this.auditService.log({
      eventType: 'AUTH_LOGOUT',
      actorId: userId,
      resourceType: 'USER',
      resourceId: userId,
      ipAddress,
      userAgent,
    });
  }

  // ── Token Refresh ───────────────────────────────────────────

  async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
  ): Promise<AuthResult> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.isRevoked) {
      // Possible token reuse attack — revoke all tokens for safety
      await this.db.refreshToken.updateMany({
        where: { userId: storedToken.userId },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      this.logger.warn(`Token reuse detected for user: ${storedToken.userId}`);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Revoke old refresh token (rotation)
    await this.db.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    const { user } = storedToken;
    const session = storedToken.sessionId
      ? await this.db.session.findUnique({ where: { id: storedToken.sessionId } })
      : null;

    const tokens = await this.generateTokenPair(
      user.id,
      user.email,
      user.role,
      session?.id ?? storedToken.sessionId ?? 'unknown',
    );

    await this.auditService.log({
      eventType: 'AUTH_TOKEN_REFRESH',
      actorId: user.id,
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
      },
      tokens,
    };
  }

  // ── Get current user ─────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        preferredLanguage: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.email.toLowerCase() === 'keshavagrawal273@gmail.com' && user.role !== 'ADMIN') {
      await this.db.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
      user.role = 'ADMIN' as any;
    }

    return user;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async generateTokenPair(
    userId: string,
    email: string,
    role: string,
    sessionId: string,
  ): Promise<TokenPair> {
    const accessExpirySeconds = this.config.get<number>('ACCESS_TOKEN_EXPIRY_SECONDS', 900);
    const refreshExpirySeconds = this.config.get<number>('REFRESH_TOKEN_EXPIRY_SECONDS', 604800);

    // Access token (JWT, short-lived)
    const payload: JwtPayload = { sub: userId, email, role, sessionId };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpirySeconds,
    });

    // Refresh token (opaque random bytes, long-lived)
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpirySeconds * 1000);

    await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash,
        sessionId,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + accessExpirySeconds * 1000),
      refreshTokenExpiresAt,
    };
  }

  private async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const expiresAt = new Date(
      Date.now() +
        this.config.get<number>('REFRESH_TOKEN_EXPIRY_SECONDS', 604800) * 1000,
    );

    return this.db.session.create({
      data: { userId, ipAddress, userAgent, expiresAt },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
