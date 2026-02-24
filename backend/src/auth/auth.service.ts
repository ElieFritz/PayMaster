import { timingSafeEqual } from 'crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UserRole } from '../common/enums/user-role.enum';
import { AuthenticatedUser } from './types/authenticated-user.type';

type ConfigUser = {
  email: string;
  password: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{
    accessToken: string;
    user: { email: string; role: UserRole };
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const users = this.resolveConfigUsers();
    const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

    if (!user || !safeCompare(user.password, password)) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload: AuthenticatedUser = {
      sub: user.email,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.resolveJwtSecret(),
      expiresIn: this.configService.get<string>('AUTH_JWT_EXPIRES_IN', '12h'),
    });

    return {
      accessToken,
      user: {
        email: user.email,
        role: user.role,
      },
    };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token, {
        secret: this.resolveJwtSecret(),
      });

      if (!payload?.email || !payload?.role || !payload?.sub) {
        throw new UnauthorizedException('Invalid authentication token payload.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }
  }

  private resolveJwtSecret(): string {
    return this.configService.get<string>('AUTH_JWT_SECRET', 'dev_paymaster_secret_change_me');
  }

  private resolveConfigUsers(): ConfigUser[] {
    const adminEmail = this.configService
      .get<string>('AUTH_ADMIN_EMAIL', 'admin@boost-performers.com')
      .trim();
    const adminPassword = this.configService
      .get<string>('AUTH_ADMIN_PASSWORD', 'ChangeMeAdmin123!')
      .trim();
    const accountantEmail = this.configService
      .get<string>('AUTH_ACCOUNTANT_EMAIL', 'comptable@boost-performers.com')
      .trim();
    const accountantPassword = this.configService
      .get<string>('AUTH_ACCOUNTANT_PASSWORD', 'ChangeMeComptable123!')
      .trim();

    return [
      {
        email: adminEmail,
        password: adminPassword,
        role: UserRole.ADMIN,
      },
      {
        email: accountantEmail,
        password: accountantPassword,
        role: UserRole.ACCOUNTANT,
      },
    ];
  }
}

function safeCompare(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
