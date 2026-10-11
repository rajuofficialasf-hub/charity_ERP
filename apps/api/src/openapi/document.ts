import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '../bootstrap';

/**
 * Generates the OpenAPI document from the controllers' ApiContract decorators (API_STANDARDS 16,
 * D-068). Paths are made relative to the `/api/v1` server like docs/api/openapi.yaml; public
 * operations get `security: []` (bearer auth is the document default).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CSS ERP API')
    .setVersion('1')
    .setOpenAPIVersion('3.1.0')
    .addServer(`/${API_PREFIX}`)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .addSecurityRequirements('bearerAuth')
    .build();
  const document = SwaggerModule.createDocument(app, config, { autoTagControllers: false });
  const prefix = `/${API_PREFIX}`;
  const paths: OpenAPIObject['paths'] = {};
  for (const [path, item] of Object.entries(document.paths)) {
    const relative = path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path;
    for (const operation of Object.values(item)) {
      if (operation && typeof operation === 'object' && 'operationId' in operation) {
        const op = operation as Record<string, unknown>;
        if (op['x-permission'] === 'public') op.security = [];
        else delete op.security;
      }
    }
    paths[relative] = item;
  }
  return { ...document, paths };
}
