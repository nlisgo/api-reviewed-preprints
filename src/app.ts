import express, { Response, Request } from 'express';
import moment from 'moment';

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
  res
    .status(statusCode)
    .set({
      'Content-Type': contentType,
      'Cache-Control': statusCode === 200 ? 'max-age=300, public, stale-if-error=86400, stale-while-revalidate=300' : 'must-revalidate, no-cache, private',
      Vary: ['Accept', 'Authorization'],
    })
    .json(message)
    .end();
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

  if (!res.hasHeader('Content-Type')) {
    writeResponse(res, 'application/vnd.elife.reviewed-preprint-list+json; version=1', 200, {
      total: 0,
      items: [],
    });
  }
});

export default app;
