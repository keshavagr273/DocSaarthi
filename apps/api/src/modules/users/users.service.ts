import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@docsaarthi/database';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string) {
    return this.db.user.findFirst({
      where: { email: { equals: email.toLowerCase().trim(), mode: 'insensitive' } },
    });
  }

  async findById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }

  async updateProfile(
    userId: string,
    data: { name?: string; preferredLanguage?: string },
  ) {
    return this.db.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        preferredLanguage: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
      },
    });
  }
}
