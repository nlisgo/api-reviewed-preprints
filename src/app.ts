import express from 'express';

const app = express();

app.get('/', async (req, res) => {
  res.json({
    body: 'Hello World',
  });
});
export default app;
