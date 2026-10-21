import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Brak tokenu uwierzytelniającego');

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token nieprawidłowy lub wygasł');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedException('Konto nieaktywne');

    request.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    return true;
  }

  private extractToken(request: { headers: Record<string, string | undefined>; query: Record<string, unknown> }) {
    const [type, value] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && value) return value;
    // EventSource (SSE) nie wspiera nagłówków — token w query
    if (typeof request.query?.token === 'string') return request.query.token;
    return undefined;
  }
}
