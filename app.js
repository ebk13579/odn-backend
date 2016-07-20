'use strict';

const compression = require('compression');
const express = require('express');
const cors = require('cors');

const app = express();
const ws = require('express-ws')(app);

app.use(compression());
app.use(cors());

app.get('/', require('./app/home'));

// Map values can be retrieved over HTTP or using Websockets.
// Since map sessions store app tokens, they do not need app tokens.
const mapValues = require('./app/data/map/values');
app.ws('/data/v1/map/values', mapValues.websocket);
app.get('/data/v1/map/values', mapValues.http);

// Every endpoint after this requires an app token parameter or header.
app.use(require('./app/token'));
app.get('/data/v1/availability', require('./app/data/availability/controller'));
app.get('/data/v1/constraint/:variable', require('./app/data/constraint/controller'));
app.get('/data/v1/values', require('./app/data/values/controller'));
app.get('/data/v1/map/new', require('./app/data/map/new'));
app.get('/suggest/v1/:type', require('./app/suggest/controller'));
app.get('/search/v1/dataset', require('./app/search/dataset'));
app.get('/search/v1/question', require('./app/search/question'));
app.get('/entity/v1', require('./app/entity/controller'));
app.get('/entity/v1/:relation', require('./app/related/controller'));

app.use(require('./app/error').respond);

const port = Number(process.env.PORT || 3001);

app.listen(port);

