/**
 * The API described once, in one place.
 *
 * Reference pages, the sidebar, the OpenAPI document and the search index are
 * all generated from this file, so the documentation cannot drift away from
 * itself. Examples below are real responses from the live dataset.
 */

export const API_BASE = 'https://api.uractor.com';
export const PORTAL_BASE = 'https://developer.uractor.com';

export const DATASET = {
  firstYear: 1929,
  lastYear: 2026,
  ceremonies: 97,
} as const;

/** Mirrors RATE_WINDOW_MS / RATE_MAX in functions/index.js. */
export const RATE_LIMIT = {
  max: 60,
  window: 'minute',
} as const;

export interface Param {
  name: string;
  type: 'string' | 'integer';
  required: boolean;
  description: string;
  example: string;
  /** How the value is compared against the data. Shown as a badge in the docs. */
  matching?: 'exact' | 'substring';
}

export interface ErrorCase {
  status: number;
  when: string;
  body: string;
}

export interface Endpoint {
  slug: string;
  /** Programme numbering, e.g. "01". Purely presentational. */
  number: string;
  title: string;
  method: 'GET';
  /** Path template using {braces} for parameters. */
  path: string;
  summary: string;
  description: string;
  params: Param[];
  returns: string;
  exampleResponse: string;
  errors: ErrorCase[];
}

const APIKEY_PARAM: Param = {
  name: 'apikey',
  type: 'string',
  required: true,
  description: 'Your API key. Issued from the developer portal.',
  example: 'YOUR_API_KEY',
};

const AUTH_ERRORS: ErrorCase[] = [
  {
    status: 403,
    when: 'The key is missing, unknown or has been revoked.',
    body: '{\n  "error": "Forbidden - Invalid API Key"\n}',
  },
  {
    status: 429,
    when: `More than ${RATE_LIMIT.max} requests in a minute from one key. Wait for the number of seconds in Retry-After.`,
    body: '{\n  "error": "Too Many Requests",\n  "limit": "60 requests per minute",\n  "retryAfter": 42\n}',
  },
  {
    status: 500,
    when: 'The archive could not be read. Safe to retry.',
    body: '{\n  "error": "Error fetching data"\n}',
  },
];

const notFound = (subject: string): ErrorCase => ({
  status: 404,
  when: `No ${subject} matched the values you supplied.`,
  body: `{\n  "error": "${subject[0].toUpperCase()}${subject.slice(1)} not found"\n}`,
});

const YEAR_PARAM: Param = {
  name: 'year',
  type: 'integer',
  required: true,
  description: `Ceremony year, between ${DATASET.firstYear} and ${DATASET.lastYear}. This is the year the ceremony was held, not the year the film was released.`,
  example: '2026',
};

export const endpoints: Endpoint[] = [
  {
    slug: 'all-ceremonies',
    number: '01',
    title: 'The complete archive',
    method: 'GET',
    path: '/oscars/apikey={apikey}',
    summary: `Every ceremony from ${DATASET.firstYear} to ${DATASET.lastYear}.`,
    description:
      'Returns the entire archive as a single object keyed by ceremony year. This is a large response — several megabytes — so prefer a narrower endpoint when you can, and cache the result if you genuinely need all of it.',
    params: [APIKEY_PARAM],
    returns: 'An object whose keys are ceremony years and whose values are arrays of categories.',
    exampleResponse: `{
  "1929": [
    {
      "category": "Best Actor in a Leading Role",
      "nominations": [ … ]
    }
  ],
  "2026": [
    {
      "category": "Best Picture",
      "nominations": [ … ]
    }
  ]
}`,
    errors: AUTH_ERRORS,
  },
  {
    slug: 'ceremony-by-year',
    number: '02',
    title: 'A single ceremony',
    method: 'GET',
    path: '/oscars/year={year}/apikey={apikey}',
    summary: 'Every category and nomination for one ceremony.',
    description:
      'Returns the categories presented at a single ceremony, in the order they appear in the archive. This is the endpoint most applications should start with.',
    params: [YEAR_PARAM, APIKEY_PARAM],
    returns: 'An array of category objects.',
    exampleResponse: `[
  {
    "category": "Best Picture",
    "nominations": [
      {
        "primary": ["One Battle after Another"],
        "secondary": ["Adam Somner", "Sara Murphy", "Paul Thomas Anderson"],
        "won": true
      },
      {
        "primary": ["Bugonia"],
        "secondary": ["Ed Guiney", "Andrew Lowe", "Yorgos Lanthimos"],
        "won": false
      }
    ]
  }
]`,
    errors: [
      {
        status: 404,
        when: 'No ceremony was held in that year, or the year is outside the archive.',
        body: '{\n  "error": "Data not found for the specified year"\n}',
      },
      ...AUTH_ERRORS,
    ],
  },
  {
    slug: 'person-by-name',
    number: '03',
    title: 'Everything a person was nominated for',
    method: 'GET',
    path: '/person/name={name}/apikey={apikey}',
    summary: 'Every nomination naming a person, across all ceremonies.',
    description:
      'Searches every ceremony for nominations naming this person, in either the primary or the secondary field. Matching is exact and case-sensitive, so pass the name exactly as the Academy records it. Because a film title can also appear in these fields, this endpoint doubles as a title search across all years.',
    params: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description:
          'The name to look for, URL-encoded. Matched exactly against each entry in the primary and secondary arrays.',
        example: 'Michael B. Jordan',
        matching: 'exact',
      },
      APIKEY_PARAM,
    ],
    returns: 'An array of matches, each carrying the year and category it came from.',
    exampleResponse: `[
  {
    "year": "2026",
    "category": "Best Performance by an Actor in a Leading Role",
    "nomination": {
      "primary": ["Michael B. Jordan"],
      "secondary": ["Sinners"],
      "won": true
    }
  }
]`,
    errors: [notFound('person'), ...AUTH_ERRORS],
  },
  {
    slug: 'film-by-name-and-year',
    number: '04',
    title: 'A film at one ceremony',
    method: 'GET',
    path: '/movie/name={name}/year={year}/apikey={apikey}',
    summary: 'Every category a film was nominated in at a given ceremony.',
    description:
      'Searches a single ceremony for nominations naming this film. Matching is exact and case-sensitive. A film usually appears in the primary field for Best Picture and in the secondary field for the craft and performance categories, so this returns both.',
    params: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'The film title, URL-encoded. Matched exactly against the primary and secondary arrays.',
        example: 'Sinners',
        matching: 'exact',
      },
      YEAR_PARAM,
      APIKEY_PARAM,
    ],
    returns: 'An array of matches, each carrying the category it came from.',
    exampleResponse: `[
  {
    "category": "Best Performance by an Actor in a Leading Role",
    "nomination": {
      "primary": ["Michael B. Jordan"],
      "secondary": ["Sinners"],
      "won": true
    }
  }
]`,
    errors: [notFound('movie'), ...AUTH_ERRORS],
  },
  {
    slug: 'category-by-name',
    number: '05',
    title: 'A category through the years',
    method: 'GET',
    path: '/award/name={name}/apikey={apikey}',
    summary: 'One award category across every ceremony.',
    description:
      'Returns every ceremony at which a category matching this name was presented. Unlike the person and film endpoints, matching here is a case-sensitive substring, which matters because category names have been renamed repeatedly — the leading acting award has been called both "Best Actor in a Leading Role" and "Best Performance by an Actor in a Leading Role". Searching for "Actor in a Leading Role" finds both.',
    params: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'The category name, URL-encoded. Matched as a substring of the full category name.',
        example: 'Actor in a Leading Role',
        matching: 'substring',
      },
      APIKEY_PARAM,
    ],
    returns: 'An array of matches, each carrying the year and the full nomination list for that category.',
    exampleResponse: `[
  {
    "year": "1929",
    "category": "Best Actor in a Leading Role",
    "nominations": [
      {
        "primary": ["Emil Jannings"],
        "secondary": ["The Last Command", "The Way of All Flesh"],
        "won": true,
        "notes": "Emil Jannings received his award early due to the fact that he was going home to Europe before the ceremony."
      }
    ]
  }
]`,
    errors: [notFound('award'), ...AUTH_ERRORS],
  },
  {
    slug: 'category-by-name-and-year',
    number: '06',
    title: 'A category at one ceremony',
    method: 'GET',
    path: '/award/name={name}/year={year}/apikey={apikey}',
    summary: 'One award category at a single ceremony.',
    description:
      'The same substring matching as the previous endpoint, narrowed to one ceremony. Use this to get a category\u2019s full slate of nominees for a given year.',
    params: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'The category name, URL-encoded. Matched as a substring of the full category name.',
        example: 'Directing',
        matching: 'substring',
      },
      YEAR_PARAM,
      APIKEY_PARAM,
    ],
    returns: 'An array of matches, each carrying the full nomination list for that category.',
    exampleResponse: `[
  {
    "category": "Best Achievement in Directing",
    "nominations": [
      {
        "primary": ["Paul Thomas Anderson"],
        "secondary": ["One Battle after Another"],
        "won": true
      }
    ]
  }
]`,
    errors: [notFound('award'), ...AUTH_ERRORS],
  },
];

export const endpointBySlug = (slug: string) => endpoints.find((e) => e.slug === slug);

/** Substitutes example values into a path template for display and for curl samples. */
export function examplePath(endpoint: Endpoint): string {
  return endpoint.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const param = endpoint.params.find((p) => p.name === name);
    return param ? encodeURIComponent(param.example) : `{${name}}`;
  });
}

export function exampleCurl(endpoint: Endpoint): string {
  return `curl "${API_BASE}${examplePath(endpoint)}"`;
}

export const guides = [
  { slug: 'getting-started', title: 'Getting started', number: 'I' },
  { slug: 'authentication', title: 'Authentication', number: 'II' },
  { slug: 'data-model', title: 'The data model', number: 'III' },
  { slug: 'errors', title: 'Errors', number: 'IV' },
  { slug: 'limits', title: 'Limits and fair use', number: 'V' },
] as const;
