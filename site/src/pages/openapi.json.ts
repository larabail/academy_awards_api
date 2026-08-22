import type { APIRoute } from 'astro';
import { endpoints, API_BASE, DATASET, PORTAL_BASE } from '../data/api';

/**
 * The OpenAPI document is generated from the same endpoint definitions that
 * build the reference pages, so the two cannot disagree.
 */
export const GET: APIRoute = () => {
  const nomination = {
    type: 'object',
    properties: {
      primary: {
        type: 'array',
        items: { type: 'string' },
        description: 'Who or what the nomination is for.',
      },
      secondary: {
        type: 'array',
        items: { type: 'string' },
        description: 'The film, or the people sharing the award.',
      },
      won: { type: 'boolean' },
      notes: { type: 'string', description: 'Optional historical footnote.' },
    },
    required: ['primary', 'won'],
  };

  const category = {
    type: 'object',
    properties: {
      category: { type: 'string' },
      nominations: { type: 'array', items: { $ref: '#/components/schemas/Nomination' } },
    },
    required: ['category', 'nominations'],
  };

  const paths: Record<string, unknown> = {};

  for (const endpoint of endpoints) {
    // OpenAPI path templating uses the same {braces} the docs use.
    paths[endpoint.path] = {
      get: {
        operationId: endpoint.slug.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
        summary: endpoint.summary,
        description: endpoint.description,
        tags: ['Academy Awards'],
        parameters: endpoint.params.map((p) => ({
          name: p.name,
          in: 'path',
          required: p.required,
          description: p.description,
          example: p.example,
          schema: { type: p.type === 'integer' ? 'integer' : 'string' },
        })),
        responses: Object.fromEntries([
          [
            '200',
            {
              description: endpoint.returns,
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          ],
          ...endpoint.errors.map((e) => [
            String(e.status),
            {
              description: e.when,
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          ]),
        ]),
      },
    };
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title: 'UrActor Academy Awards API',
      version: '1.0.0',
      summary: `Academy Awards data for ${DATASET.ceremonies} ceremonies, ${DATASET.firstYear} to ${DATASET.lastYear}.`,
      description:
        'A free, read-only JSON API for Academy Awards nominations and winners. The API key is supplied as the final path segment rather than a header or query parameter.',
      contact: { url: PORTAL_BASE },
    },
    servers: [{ url: API_BASE }],
    externalDocs: { url: PORTAL_BASE, description: 'Developer portal' },
    paths,
    components: {
      schemas: {
        Nomination: nomination,
        Category: category,
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
          required: ['error'],
        },
      },
    },
  };

  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
