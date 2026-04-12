import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import shipmentsRouter from './routes/shipments.js';
import routeNetworkRouter from './routes/routes.js';
import disruptionsRouter from './routes/disruptions.js';
import aiRouter from './routes/ai.js';
import alertsRouter from './routes/alerts.js';
import dashboardRouter from './routes/analytics.js';
import demoRouter from './routes/demo.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { emitSocketEvent, initSocket } from './socket.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
initSocket(httpServer);

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.locals.emitEvent = emitSocketEvent;

app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running', websocket: 'enabled' });
});

app.use('/api/shipments', shipmentsRouter);
app.use('/api', routeNetworkRouter);
app.use('/api/disruptions', disruptionsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/demo', demoRouter);
app.use('/ai', aiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
