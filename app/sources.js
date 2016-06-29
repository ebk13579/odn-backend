'use strict';

const _ = require('lodash');
const fs = require('fs');

function trim(tree, path) {
    if (_.isNil(tree)) return tree;
    if (path.length === 0) return tree;

    const id = path[0];
    if (!(id in tree)) return null;
    let subtree = tree[id];
    if (path.length === 1) return {[id]: subtree};

    const subpath = path.slice(1);
    if ('topics' in subtree) subtree.topics = trim(subtree.topics, subpath);
    if ('variables' in subtree) subtree.variables = trim(subtree.variables, subpath);
    if ('datasets' in subtree) subtree.datasets = trim(subtree.datasets, subpath);
    if (_.isNil(subtree.topics)) delete subtree.topics;
    if (_.isNil(subtree.variables)) delete subtree.variables;
    if (_.isNil(subtree.datasets)) delete subtree.datasets;

    return tree;
}

function mapTree(tree, iteratee, parents) {
    parents = parents || [];
    parents = parents.slice(0);
    if ('topics' in tree || 'datasets' in tree || 'variables' in tree)
        parents.push(tree);

    return _.mapValues(tree, (value, key) => {
        if (_.isPlainObject(value)) {
            return mapTree(iteratee(value, key, parents), iteratee, parents);
        } else {
            return value;
        }
    });
}

function getPath(id) {
    return id.split('.');
}

class Sources {
    constructor(json) {
        this.topics = mapTree(json, (value, key, parents) => {
            if (!_.includes(['topics', 'datasets', 'variables'], key)) {
                const path = parents.length === 0 ? key :
                    `${_.last(parents).id}.${key}`;

                const augmented = _.assign(value, {id: path});
                if ('variables' in value) {
                    augmented.url = `https://${value.domain}/resource/${value.fxf}.json`;
                }


                if (parents.length > 0) {
                    const parentNode = _.last(parents);

                    if ('variables' in parentNode) {
                        if (!('name' in value)) {
                            augmented.name = key.replace('-', ' ');
                        }
                    }
                }

                return augmented;
            }
            return value;
        });
    }

    getTopics() {
        return _.cloneDeep(this.topics);
    }

    search(datasetID) {
        return trim(this.getTopics(), getPath(datasetID));
    }

    searchMany(datasetIDs) {
        const trees = datasetIDs.map(id => this.search(id));
        if (_.some(trees, _.isNil)) return null;
        return _.merge.apply(this, trees);
    }

    mapVariables(tree, iteratee) {
        return mapTree(tree, (value, key, parents) => {
            if (parents.length === 0) return value;
            const parentNode = _.last(parents);
            const isVariable = 'variables' in parentNode &&
                key in parentNode.variables;
            if (isVariable) return iteratee(value, key, parents);
            return value;
        });
    }

    static fromFile(path) {
        const declarationJSON = JSON.parse(fs.readFileSync(path));
        return new Sources(declarationJSON);
    }
}

module.exports = Sources.fromFile('data/sources-map.json');

