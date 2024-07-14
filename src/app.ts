import express, { Response, Request } from 'express';
import moment from 'moment';
import { Content } from './types/content';
import { Author } from './types/author';
import { contentToHtml } from './utils/content-to-html';

type ProcessedArticle = {
  title: Content,
  authors?: Author[],
  licenses: {
    type: string,
    url?: string,
    content?: Content,
  }[],
  headings: {
    id: string,
    text: Content,
  }[],
  references: {
    title: string,
  }[],
};

type EnhancedArticleNoContent = EnhancedArticle & {
  article: ProcessedArticle,
  firstPublished: Date,
};

type RelatedContent = {
  type: string,
  title: string,
  url: string,
  content?: string,
  imageUrl?: string,
};

type EnhancedArticle = {
  id: string,
  msid: string,
  doi: string,
  versionIdentifier: string,
  versionDoi?: string,
  preprintDoi: string,
  preprintUrl: string,
  preprintPosted: Date,
  sentForReview?: Date,
  published: Date | null,
  publishedYear?: number,
  volume?: string,
  eLocationId?: string,
  subjects?: string[],
  pdfUrl?: string,
  relatedContent?: RelatedContent[],
};

type BadRequestMessage = {
  title: 'bad request' | 'not found',
  detail?: string,
};

type ReviewedPreprintSnippet = {
  id: string,
  doi: string,
  pdf?: string,
  status: 'reviewed',
  authorLine?: string,
  title?: string,
  published?: string,
  reviewedDate?: string,
  versionDate?: string,
  statusDate?: string,
  stage: 'published',
  subjects?: {
    id: string,
    name: string,
  }[],
};

type ReviewedPreprintItemResponse = {
  indexContent?: string,
} & ReviewedPreprintSnippet;

type ReviewedPreprintListResponse = {
  total: number,
  items: ReviewedPreprintSnippet[],
};

export const writeResponse = (res: Response, contentType: string, statusCode: 200 | 400 | 404, message: BadRequestMessage | ReviewedPreprintListResponse | ReviewedPreprintItemResponse) : void => {
  if (!res.headersSent) {
    res
      .status(statusCode)
      .set({
        'Content-Type': contentType,
        'Cache-Control': statusCode === 200 ? 'max-age=300, public, stale-if-error=86400, stale-while-revalidate=300' : 'must-revalidate, no-cache, private',
        Vary: ['Accept', 'Authorization'],
      })
      .json(message);
  }
};

const errorBadRequest = (res: Response, message: string) : void => {
  writeResponse(res, 'application/problem+json', 400, {
    title: 'bad request',
    detail: message,
  });
};

const errorNotFoundRequest = (res: Response) : void => {
  writeResponse(res, 'application/json', 404, {
    title: 'not found',
  });
};

type Param = string | Number | Array<string | Number> | null;

const queryParam = (req: Request, key: string, defaultValue: Param = null) : Param => req.query[key] as string ?? defaultValue;

const fetchVersionsNoContent = async (page: number, perPage: number, order: 'asc' | 'desc', useDate: 'default' | 'published', startDate: string, endDate: string) => {
  const url = [
    'http://wiremock:3000/api/preprints-no-content?',
    [
      `page=${page}`,
      `per-page=${perPage}`,
      `order=${order}`,
      useDate === 'published' ? 'use-date=firstPublished' : '',
      startDate ? `start-date=${startDate}` : '',
      endDate ? `end-date=${new Date(new Date().setDate(new Date(endDate).getUTCDate() + 1)).toISOString().split('T')[0]}` : '',
    ].filter((q) => q).join('&'),
  ].join('');
  return fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`error fetching (${url}): ${response.statusText}`);
      }

      const items = await response.json() as EnhancedArticleNoContent[];

      const total = response.headers.get('x-total-count')
        ? parseInt(response.headers.get('x-total-count') as string, 10)
        : Object.keys(items).length;

      return {
        total,
        items,
      };
    });
};

const prepareAuthor = (author: Author) : string => {
  const givenNames = (author.givenNames ?? []).join(' ');
  const familyNames = (author.familyNames ?? []).join(' ');

  return `${givenNames}${familyNames ? ' ' : ''}${familyNames}`;
};

const prepareAuthorLine = (authors: Author[]) : undefined | string => {
  if (authors.length === 0) {
    return;
  }

  const authorLine = [];

  if (authors.length > 0) {
    authorLine.push(prepareAuthor(authors[0]));
  }

  if (authors.length > 1) {
    authorLine.push(prepareAuthor(authors[1]));
  }

  if (authors.length > 2) {
    authorLine.push(prepareAuthor(authors[authors.length - 1]));
  }

  return [authorLine.slice(0, 2).join(', '), authorLine.length > 2 ? authorLine[2] : null].filter((a) => a !== null).join(authors.length > 3 ? ' ... ' : ', '); // eslint-disable-line consistent-return
};

type Subject = {
  id: string,
  name: string,
};

const msaNames: Record<string, string> = {
  'Biochemistry and Chemical Biology': 'biochemistry-chemical-biology',
  'Cancer Biology': 'cancer-biology',
  'Cell Biology': 'cell-biology',
  'Chromosomes and Gene Expression': 'chromosomes-gene-expression',
  'Computational and Systems Biology': 'computational-systems-biology',
  'Developmental Biology': 'developmental-biology',
  Ecology: 'ecology',
  'Epidemiology and Global Health': 'epidemiology-global-health',
  'Evolutionary Biology': 'evolutionary-biology',
  'Genetics and Genomics': 'genetics-genomics',
  'Immunology and Inflammation': 'immunology-inflammation',
  Medicine: 'medicine',
  'Microbiology and Infectious Disease': 'microbiology-infectious-disease',
  Neuroscience: 'neuroscience',
  'Physics of Living Systems': 'physics-living-systems',
  'Plant Biology': 'plant-biology',
  'Stem Cells and Regenerative Medicine': 'stem-cells-regenerative-medicine',
  'Structural Biology and Molecular Biophysics': 'structural-biology-molecular-biophysics',
};

const getSubjects = (subjectNames: string[]) : Subject[] => subjectNames.map((subjectName) => ({
  id: msaNames[subjectName],
  name: subjectName,
}));

const toIsoStringWithoutMilliseconds = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
};

const enhancedArticleNoContentToSnippet = ({
  msid,
  preprintDoi,
  pdfUrl,
  article,
  published,
  subjects,
  firstPublished,
}: EnhancedArticleNoContent): ReviewedPreprintSnippet => ({
  id: msid,
  doi: preprintDoi,
  pdf: pdfUrl,
  status: 'reviewed',
  authorLine: prepareAuthorLine(article.authors || []),
  title: contentToHtml(article.title),
  published: toIsoStringWithoutMilliseconds(new Date(firstPublished)),
  reviewedDate: toIsoStringWithoutMilliseconds(new Date(firstPublished)),
  versionDate: toIsoStringWithoutMilliseconds(new Date(published!)),
  statusDate: toIsoStringWithoutMilliseconds(new Date(published!)),
  stage: 'published',
  subjects: getSubjects(subjects || []),
});

const app = express();

app.get('/', async (req, res) => {
  const [perPage, page] = [
    queryParam(req, 'per-page', 20),
    queryParam(req, 'page', 1),
  ].map((v) => {
    const n = Number(v);

    return n.toString() === parseInt(n.toString(), 10).toString() ? n : -1;
  });

  const order = (queryParam(req, 'order') || 'desc').toString();
  const useDate = (queryParam(req, 'use-date') || 'default').toString();
  const startDate = (queryParam(req, 'start-date') || '').toString();
  const endDate = (queryParam(req, 'end-date') || '').toString();

  if (page <= 0) {
    errorBadRequest(res, 'expecting positive integer for \'page\' parameter');
  }

  if (perPage <= 0 || perPage > 100) {
    errorBadRequest(res, 'expecting positive integer between 1 and 100 for \'per-page\' parameter');
  }

  if (!['asc', 'desc'].includes(order)) {
    errorBadRequest(res, 'expecting either \'asc\' or \'desc\' for \'order\' parameter');
  }

  if (!['default', 'published'].includes(useDate)) {
    errorBadRequest(res, 'expecting either \'default\' or \'published\' for \'use-date\' parameter');
  }

  if (startDate && !moment(startDate, 'YYYY-MM-DD', true).isValid()) {
    errorBadRequest(res, 'expecting YYYY-MM-DD format for \'start-date\' parameter');
  }

  if (endDate && !moment(endDate, 'YYYY-MM-DD', true).isValid()) {
    errorBadRequest(res, 'expecting YYYY-MM-DD format for \'end-date\' parameter');
  }

  const results = await fetchVersionsNoContent(page, perPage, order as 'asc' | 'desc', useDate as 'default' | 'published', startDate, endDate);

  const items = Array.from(results.items).map(enhancedArticleNoContentToSnippet);

  writeResponse(res, 'application/vnd.elife.reviewed-preprint-list+json; version=1', 200, {
    total: results.total,
    items,
  });
});

app.get('/:id', async (req, res) => {
  errorNotFoundRequest(res);
});

export default app;
