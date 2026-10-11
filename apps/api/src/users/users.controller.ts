import { Controller, Get, Headers, HttpCode, Inject, Post, Res } from '@nestjs/common';
import {
  reasonRequestSchema,
  type ReasonRequest,
  USER_STATES,
  userStateRequestSchema,
  type UserStateRequest,
} from '@css/shared/auth';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, type Principal } from '../auth/principal';
import { ok, page } from '../core/envelope';
import { etagOf } from '../core/etag';
import { pageQuery } from '../core/pagination';
import { ZBody, ZParam, ZQuery } from '../core/validation';
import { ApiContract } from '../openapi/api-contract';
import { type UserListQuery, UsersService } from './users.service';

const uuid = z.uuid();
const listQuery = pageQuery.omit({ sort: true }).extend({
  q: z.string().min(2).max(100).optional(),
  role: z.string().max(64).optional(),
  state: z.enum(USER_STATES).optional(),
});

const userOp = {
  tag: 'users',
  scope: 'user',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};

/** User administration (AUTH.md 6, 7, 11; O-59 item 1 and 2; openapi tag users). */
@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @ApiContract({
    ...userOp,
    operationId: 'users.user.list',
    summary: 'List users within scope (assignee pickers, permission panel)',
    permission: 'permission.view',
    audit: 'none',
    query: listQuery,
    responses: { 200: null, 401: null, 403: null, 422: null },
  })
  async list(@CurrentUser() actor: Principal, @ZQuery(listQuery) query: UserListQuery) {
    const { rows, meta } = await this.users.list(query, actor);
    return page(rows, meta);
  }

  @Get(':userId')
  @ApiContract({
    ...userOp,
    operationId: 'users.user.get',
    summary: 'Get a user',
    permission: 'permission.view',
    audit: 'none',
    params: { userId: uuid },
    responses: { 200: null, 401: null, 403: null, 404: null },
  })
  async get(@ZParam('userId', uuid) userId: string, @Res({ passthrough: true }) res: Response) {
    const { user, updatedAt } = await this.users.get(userId);
    res.setHeader('ETag', etagOf(updatedAt));
    return ok(user, { etag: etagOf(updatedAt) });
  }

  @Post(':userId/state')
  @HttpCode(200)
  @ApiContract({
    ...userOp,
    operationId: 'users.user.changeState',
    summary: 'Change account state with a reason; deactivation needs a completed handover',
    permission: 'user.state.change',
    audit: 'auth.state_changed',
    params: { userId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: userStateRequestSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 409: null, 412: null, 422: null },
  })
  async changeState(
    @CurrentUser() actor: Principal,
    @ZParam('userId', uuid) userId: string,
    @ZBody(userStateRequestSchema) body: UserStateRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, updatedAt } = await this.users.changeState(actor, userId, body, ifMatch);
    res.setHeader('ETag', etagOf(updatedAt));
    return ok(user, { etag: etagOf(updatedAt) });
  }

  @Post(':userId/unlock')
  @HttpCode(204)
  @ApiContract({
    ...userOp,
    operationId: 'users.user.unlock',
    summary: 'Clear a login lock with a reason (O-59)',
    permission: 'user.lock.clear',
    audit: 'auth.lock_cleared',
    params: { userId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
  })
  async unlock(
    @CurrentUser() actor: Principal,
    @ZParam('userId', uuid) userId: string,
    @ZBody(reasonRequestSchema) body: ReasonRequest,
  ) {
    await this.users.unlock(actor, userId, body.reason);
  }
}
