'use strict';

const Promise = require('bluebird');
const nunjucks = require('nunjucks');
const helpers  = require('@frctl/nunjucks-helpers');
const _        = require('lodash');

module.exports = function(source, config){

    config = config || {};

    let viewCache = null;

    /**
     * Create a custom string loader and instantiate a new Nunjucks environment object with it.
     * We don't want to use the FileSystemLoader as we already have
     * the contents of all files cached in the component file tree.
     */

    const StringLoader = nunjucks.Loader.extend({
        getSource: function(handle) {
            handle = handle.replace('@','');
            const view = _.find(viewCache, function(view){
                return (view.handle === handle || view.alias === handle);
            });
            if (view) {
                return {
                    src: view.content,
                    path: view.path,
                    noCache: true
                };
            }
            throw new Error('Partial template not found.');
        }
    });

    let nj = new nunjucks.Environment(new StringLoader(), {
        autoescape: false
    });

    nj = Promise.promisifyAll(nj);

    if (config.loadHelpers) {
        helpers.use(source._app);
        _.each(helpers.require('filters') || {}, function(filter, name){
            addFilter(name, filter);
        });
        _.each(helpers.require('extensions') || {}, function(ext, name){
            nj.addExtension(name, ext);
        });
    }

    _.each(config.filters || {}, function(filter, name){
        addFilter(name, filter);
    });
    _.each(config.extensions || {}, function(ext, name){
        nj.addExtension(name, ext);
    });
    _.each(config.globals || {}, function(value, name){
        nj.addGlobal(name, value);
    });

    function loadViews(source) {
        viewCache = source.flattenDeep().items();
    }

    function addFilter(name, filter){
        if (typeof filter === 'function') {
            nj.addFilter(name, filter);
        } else if (typeof filter === 'object') {
            nj.addFilter(name, filter.filter, filter.async);
        }
    }

    source.on('loaded', loadViews);
    source.on('changed', loadViews);

    return {
        engine: nj,
        render: function(path, str, context, callback){
            if (!viewCache) loadViews(source);
            return nj.renderStringAsync(str, context);
        }
    };

};