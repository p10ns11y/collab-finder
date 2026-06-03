# TypeScript / JavaScript Optimizer Reference

Portable defaults. **devprofile** overlay: [devprofile-typescript.md](devprofile-typescript.md).

## Extraction Strategy (no full parser needed in basic mode)
- Scan for `export interface`, `export type`, `export class`, `export function`, `export const`
- Keep full type definitions (they are usually small and high signal)
- For functions: signature + JSDoc first line + "implementation: [one sentence business logic]"
- React/Next.js specific:
  - Server Components: "async ServerComponent({params}) — fetches data from DB, renders <UserList />"
  - Client Components: "uses 'use client', useState for modal, useEffect for realtime subscription via Supabase"
- Node.js / NestJS / Express:
  - Controllers: list all `@Get()`, `@Post()` decorators with route + guard + DTO
  - Services: method signatures only unless the method is the direct target of the query

## High-Signal Patterns to Preserve
- Zod / Yup / Joi schemas (full — they define contracts)
- tRPC routers (procedure definitions)
- GraphQL typeDefs or codegen types
- Environment variable typing (`process.env` augmentation)

## Compression Examples
```ts
// apps/api/src/users/user.controller.ts (891 LOC → 64 tokens)
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() { /* delegates to service with pagination */ }

  @Post()
  create(@Body() dto: CreateUserDto) { /* validates, hashes password, emits UserCreatedEvent */ }
}

// src/lib/types.ts (types only — keep 100%)
export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

export type CreateUserInput = Omit<User, 'id' | 'createdAt'>;
```

## React / Frontend Specific
- Component props interface → always full
- Custom hooks: `useUser()` → "returns {user, loading, error, refetch}, uses SWR under the hood, revalidates on focus"
- State management (Zustand, Redux, Jotai): "userStore: {user, setUser, logout}, persisted to localStorage"
