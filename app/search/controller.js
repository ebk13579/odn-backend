'use strict';

const _ = require('lodash');
const Exception = require('../error');
const invalid = Exception.invalidParam;
const notFound = Exception.notFound;
const EntityLookup = require('../entity-lookup');
const Sources = require('../sources');
const Stopwords = require('../stopwords');
const Aliases = require('../aliases');
const Constants = require('../constants');
const Request = require('../request');

const validTypes = ['dataset', 'category', 'publisher'];

module.exports = (request, response) => {
    const errorHandler = Exception.getHandler(request, response);

    Promise.all([
        getType(request),
        getQuery(request),
        getEntities(request),
        getSearchTerms(request),
        getLimit(request),
        getOffset(request)
    ]).then(([type, query, entities, searchTerms, limit, offset]) => {
        searchDatasets(entities, searchTerms, query, limit, offset).then(datasets => {
            response.json({datasets});
        }).catch(errorHandler);
    }).catch(errorHandler);
};

function searchDatasets(entities, searchTerms, query, limit, offset) {
    const params = {
        limit,
        offset,
        q_internal: qInternal(entities, searchTerms, query),
        only: 'datasets'
    };
    const url = Request.buildURL(Constants.CATALOG_URL, params);
    console.log(params);
    console.log(url);

    return Request.getJSON(url).then(results => {
        const datasets = results.results.map(getDataset);
        return Promise.resolve(datasets);
    });
}

function getDataset(result) {
    const resource = result.resource;
    const fxf = resource.nbe_fxf || resource.fxf;
    const domain = result.metadata.domain;

    return _.assign(_.pick(resource, ['name', 'description', 'attribution']), {
        domain,
        domain_url: `http://${domain}`,
        dataset_url: result.permalink,
        dev_docs_url: `https://dev.socrata.com/foundry/${domain}/${fxf}`,
        updated_at: resource.updatedAt,
        created_at: resource.createdAt,
        categories: result.classification.categories
    });
}

function qInternal(entities, searchTerms, query) {
    return and([
        or(entities.map(queryEntity)),
        or(searchTerms.map(quote)),
        quote(query)
    ]);
}

function queryEntity(entity) {
    const words = split(entity.name)
        .filter(_.negate(stopword));
    const aliased = words.map(word => Aliases.get(word).concat([word]).map(quote));
    const grouped = _(aliased)
        .groupBy(_.size)
        .values()
        .value();
    return and(grouped.map(aliases => or(aliases.map(or))));
}

function split(phrase) {
    return phrase
        .replace(/[-_\/\\]/g, ' ')
        .replace(/[,\)\(]/g, '')
        .replace(/\s+/g, ' ')
        .split(' ');
}

function stopword(word) {
    return _.includes(['Metro', 'Area'], word);
}

function and(queries) {
    return queryJoin(queries, ' AND ');
}

function or(queries) {
    return queryJoin(queries, ' OR ');
}

function queryJoin(queries, join) {
    if (queries.length === 0) return '';
    queries = queries.filter(query => !(_.isNil(query) || _.isEmpty(query)));
    if (queries.length === 1) return queries[0];
    return paren(queries.join(join));
}

function quote(word) {
    const control = /^(OR|AND)$/i;
    const whitespace = /\s/;
    if (control.test(word) || word.search(whitespace) > -1) return `"${word}"`;
    return word;
}

function paren(query) {
    return `(${query})`;
}

function getSearchTerms(request) {
    const datasetID = request.query.dataset_id;
    if (_.isNil(datasetID) || datasetID === '') return Promise.resolve([]);

    const tree = Sources.search(datasetID);
    if (_.isNil(tree))
        return Promise.reject(notFound(`dataset not found: ${datasetID}`));

    const topic = _.first(_.values(tree));
    if (_.size(topic.datasets) !== 1)
        return Promise.reject(invalid(`expected variable but found topic: ${datasetID}`));

    const dataset = _.first(_.values(topic.datasets));
    return Promise.resolve(dataset.searchTerms || []);
}

function getEntities(request) {
    const ids = request.query.entity_id;
    if (_.isNil(ids) || ids === '') return Promise.resolve([]);
    return EntityLookup.byIDs(ids);
}

function getType(request) {
    let type = request.params.type;
    if (_.isNil(type)) return Promise.reject(invalid('type parameter required'));
    if (!_.includes(validTypes, type))
        return Promise.reject(notFound(`invalid type ${type}. Must be one of ${validTypes}`));
    return Promise.resolve(type);
}

function getQuery(request) {
    return Promise.resolve(request.query.query || '');
}

function getOffset(request) {
    return getPositiveInteger('offset', request.query.offset, 0);
}

function getLimit(request) {
    return getPositiveInteger('limit', request.query.limit, Constants.CATALOG_LIMIT_DEFAULT).then(limit => {
        if (limit > Constants.CATALOG_LIMIT_MAX)
            return Promise.reject(`limit cannot be greater than ${Constants.CATALOG_LIMIT_MAX}`);
        return Promise.resolve(limit);
    });
}

function getPositiveInteger(name, value, defaultValue) {
    if (_.isNil(value)) return Promise.resolve(defaultValue);

    value = parseInt(value);
    if (isNaN(value)) return Promise.reject(invalid(`${name} must be an integer`));
    if (value < 0) return Promise.reject(invalid(`${name} must be greater than or equal to zero`));

    return Promise.resolve(value);
}

